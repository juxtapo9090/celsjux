#!/usr/bin/env bash
# globe_collector.sh — Gather real network footprint for the globe
# "Some hide their tracks. We put ours on a spinning globe." 🌍
#
# Sources:
#   - ss -tn (all active TCP connections from PC)
#   - Claude Code connections (node/bun processes)
#   - Codex connections (if running)
#   - WireGuard peers (from VPS)
#   - fail2ban banned IPs (from VPS)
#
# Output: data/globe.json (consumed by the WebGL globe)

WEB_DATA="/root/Opus/Pool/Opus_Web/data"
CACHE="/tmp/globe_geoip_cache.json"
OUTPUT="$WEB_DATA/globe.json"

mkdir -p "$WEB_DATA"

# GeoIP cache — don't hammer the free API
touch "$CACHE"

geoip() {
    local ip="$1"
    # Check cache first
    local cached=$(python3 -c "
import json
try:
    d = json.load(open('$CACHE'))
    e = d.get('$ip')
    if e: print(json.dumps(e))
except: pass
" 2>/dev/null)

    if [[ -n "$cached" ]]; then
        echo "$cached"
        return
    fi

    # Fetch from API (rate limit: 1/sec for free tier)
    local data=$(curl -s "http://ip-api.com/json/$ip?fields=query,city,country,countryCode,lat,lon,org" 2>/dev/null)
    if echo "$data" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('lat')" 2>/dev/null; then
        # Cache it
        python3 -c "
import json
try: d = json.load(open('$CACHE'))
except: d = {}
d['$ip'] = json.loads('$data')
json.dump(d, open('$CACHE','w'), indent=2)
" 2>/dev/null
        echo "$data"
    fi
    sleep 1  # rate limit
}

# ── Collect IPs ──

# All PC connections (external only)
PC_IPS=$(ss -tn state established | awk '{print $5}' | cut -d: -f1 | sort -u | grep -vE "^$|^10\.|^127\.|^192\.168\.|^::")

# Claude Code specific
CC_IPS=$(ss -tnp | grep -iE "claude|node|bun" | awk '{print $5}' | cut -d: -f1 | sort -u | grep -vE "^$|^10\.|^127\.")

# Codex specific
CODEX_IPS=$(ss -tnp | grep -iE "codex" | awk '{print $5}' | cut -d: -f1 | sort -u | grep -vE "^$|^10\.|^127\.")

# WireGuard peers (from VPS)
WG_PEERS=""
if ssh -o ConnectTimeout=3 vps "wg show wg0 endpoints" &>/dev/null; then
    WG_PEERS=$(ssh vps "wg show wg0 endpoints" 2>/dev/null | awk '{print $2}' | cut -d: -f1 | grep -vE "none|\(")
fi

# fail2ban attackers (from VPS)
ATTACKERS=""
if ssh -o ConnectTimeout=3 vps "fail2ban-client status sshd" &>/dev/null; then
    ATTACKERS=$(ssh vps "fail2ban-client status sshd" 2>/dev/null | grep "Banned IP" | sed 's/.*://;s/^ //' | tr ' ' '\n' | grep -v "^$")
fi

# Our own public IP
MY_IP=$(curl -s ifconfig.me 2>/dev/null)

# ── Build JSON ──

python3 << PYEOF
import json, sys

nodes = []
arcs = []
attackers_list = []
seen = set()

def add_node(ip, ntype, label_override=None):
    if ip in seen or not ip.strip():
        return
    seen.add(ip)
    try:
        data = json.loads("""$(geoip "$ip" 2>/dev/null || echo '{}')""")
    except:
        return
    if not data.get('lat'):
        return
    nodes.append({
        "ip": ip,
        "lat": data["lat"],
        "lng": data["lon"],
        "city": data.get("city", ""),
        "country": data.get("countryCode", ""),
        "org": data.get("org", "")[:40],
        "type": ntype,
        "label": label_override or f"{data.get('city','')} {data.get('countryCode','')}"
    })

# Our PC
my_ip = "$MY_IP"

# Process all collected IPs
pc_ips = """$PC_IPS""".strip().split('\n')
cc_ips = """$CC_IPS""".strip().split('\n')
codex_ips = """$CODEX_IPS""".strip().split('\n')
wg_ips = """$WG_PEERS""".strip().split('\n')
attacker_ips = """$ATTACKERS""".strip().split('\n')

PYEOF

# Actually let's do this simpler — collect all GeoIP first, then build JSON
echo "🌍 Globe collector starting..."

ALL_NODES="[]"
ALL_ARCS="[]"
ALL_ATTACKERS="[]"

# Build nodes array via GeoIP lookups
NODES_JSON="["
FIRST=true

# Our PC
if [[ -n "$MY_IP" ]]; then
    geo=$(geoip "$MY_IP")
    if [[ -n "$geo" ]]; then
        $FIRST || NODES_JSON+=","
        FIRST=false
        NODES_JSON+=$(echo "$geo" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(json.dumps({'ip':d['query'],'lat':d['lat'],'lng':d['lon'],'label':'PC Malaysia','type':'self','org':d.get('org','')[:40]}))")
    fi
fi

# CC connections
for ip in $CC_IPS; do
    [[ -z "$ip" ]] && continue
    geo=$(geoip "$ip")
    [[ -z "$geo" ]] && continue
    NODES_JSON+=","
    NODES_JSON+=$(echo "$geo" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(json.dumps({'ip':d['query'],'lat':d['lat'],'lng':d['lon'],'label':f'{d.get(\"org\",\"\")[:30]}','type':'claude','org':d.get('org','')[:40]}))")
done

# WireGuard peers
for ip in $WG_PEERS; do
    [[ -z "$ip" ]] && continue
    geo=$(geoip "$ip")
    [[ -z "$geo" ]] && continue
    NODES_JSON+=","
    NODES_JSON+=$(echo "$geo" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(json.dumps({'ip':d['query'],'lat':d['lat'],'lng':d['lon'],'label':'WG Peer','type':'mesh','org':d.get('org','')[:40]}))")
done

# VPS itself
geo=$(geoip "45.32.102.13")
if [[ -n "$geo" ]]; then
    NODES_JSON+=","
    NODES_JSON+=$(echo "$geo" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(json.dumps({'ip':d['query'],'lat':d['lat'],'lng':d['lon'],'label':'celsjux-sg VPS','type':'hub','org':d.get('org','')[:40]}))")
fi

# Attackers
for ip in $ATTACKERS; do
    [[ -z "$ip" ]] && continue
    geo=$(geoip "$ip")
    [[ -z "$geo" ]] && continue
    NODES_JSON+=","
    NODES_JSON+=$(echo "$geo" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(json.dumps({'ip':d['query'],'lat':d['lat'],'lng':d['lon'],'label':'blocked','type':'attacker','org':d.get('org','')[:40]}))")
done

NODES_JSON+="]"

# Write output
cat > "$OUTPUT" << JSONEOF
{
  "collected_at": "$(date -Iseconds)",
  "my_ip": "$MY_IP",
  "nodes": $NODES_JSON,
  "cc_ips": [$(echo $CC_IPS | tr ' ' '\n' | grep -v '^$' | sed 's/.*/"&"/' | paste -sd,)],
  "wg_peers": [$(echo $WG_PEERS | tr ' ' '\n' | grep -v '^$' | sed 's/.*/"&"/' | paste -sd,)],
  "attacker_count": $(echo "$ATTACKERS" | grep -c . 2>/dev/null || echo 0)
}
JSONEOF

echo "🌍 Globe data → $OUTPUT"
cat "$OUTPUT" | python3 -m json.tool 2>/dev/null | head -20
