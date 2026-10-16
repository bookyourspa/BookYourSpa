#!/usr/bin/env bash
BASE="${BASE:-http://127.0.0.1:3000}"
pass=0; fail=0
ok(){ if [ "$2" = "1" ]; then pass=$((pass+1)); echo "  ✓ $1"; else fail=$((fail+1)); echo "  ✗ $1 $3"; fi; }

hdr(){ curl -s -o /dev/null -D - "$@"; }
code(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }

# public pages
c=$(code "$BASE/"); ok "home 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/spas/"); ok "search 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/spas/aurora-wellness-house/"); ok "spa detail 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/treatments/"); ok "treatments 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/packages/"); ok "packages 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/offers/"); ok "offers 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/destinations/bali/"); ok "destination 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/faq/"); ok "faq 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/contact/"); ok "contact 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/login/"); ok "login 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/register/"); ok "register 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/supplier/register/"); ok "supplier register 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/sitemap.xml"); ok "sitemap 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/robots.txt"); ok "robots 200" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(code "$BASE/no-such-page/"); ok "404 page" $([ "$c" = "404" ] && echo 1) "got $c"

# content checks
body=$(curl -s "$BASE/")
ok "home has hero headline" $(echo "$body" | grep -c "Where stillness" | awk '{print ($1>0)?1:0}')
ok "home has JSON-LD" $(echo "$body" | grep -c "application/ld+json" | awk '{print ($1>0)?1:0}')
ok "home has og:image" $(echo "$body" | grep -c 'og:image' | awk '{print ($1>0)?1:0}')
ok "home has structured FAQ" $(echo "$body" | grep -c "FAQPage" | awk '{print ($1>0)?1:0}')
body=$(curl -s "$BASE/spas/aurora-wellness-house/")
ok "spa page has LocalBusiness schema" $(echo "$body" | grep -c "HealthAndBeautyBusiness" | awk '{print ($1>0)?1:0}')
ok "spa page has price offers" $(echo "$body" | grep -c "makesOffer" | awk '{print ($1>0)?1:0}')
ok "spa page renders gallery" $(echo "$body" | grep -c 'alt="Aurora Wellness House — photo 1"' | awk '{print ($1>0)?1:0}')

# security headers
h=$(hdr "$BASE/")
ok "CSP header" $(echo "$h" | grep -ci "content-security-policy" | awk '{print ($1>0)?1:0}')
ok "X-Frame-Options DENY" $(echo "$h" | grep -ic "x-frame-options: DENY" | awk '{print ($1>0)?1:0}')
ok "nosniff" $(echo "$h" | grep -ic "x-content-type-options: nosniff" | awk '{print ($1>0)?1:0}')
ok "referrer policy" $(echo "$h" | grep -ic "referrer-policy" | awk '{print ($1>0)?1:0}')

# gating (anonymous)
c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin"); loc=$(curl -s -o /dev/null -D - "$BASE/admin" | grep -i "^location:" | tr -d '\r')
ok "anon /admin -> login" $([ "$c" = "302" ] && echo 1) "got $c $loc"
c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/supplier"); ok "anon /supplier -> login" $([ "$c" = "302" ] && echo 1) "got $c"

# sessions
CUST=$(curl -s -c - -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -H 'x-bys-csrf: 1' -d '{"email":"anna.customer@example.com","password":"Customer@2026!"}' | grep bys_session | awk '{print $NF}')
SUP=$(curl -s -c - -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -H 'x-bys-csrf: 1' -d '{"email":"owner@aurora-wellness.com","password":"Supplier@2026!"}' | grep bys_session | awk '{print $NF}')
ADM=$(curl -s -c - -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -H 'x-bys-csrf: 1' -d '{"email":"admin@bookyourspa.net","password":"Admin@2026!"}' | grep bys_session | awk '{print $NF}')
ok "sessions obtained" $([ -n "$CUST" ] && [ -n "$SUP" ] && [ -n "$ADM" ] && echo 1) ""

c=$(curl -s -o /dev/null -w "%{http_code}" -H "cookie: bys_session=$CUST" "$BASE/admin")
loc=$(curl -s -o /dev/null -D - -H "cookie: bys_session=$CUST" "$BASE/admin" | grep -i "^location:" | tr -d '\r')
ok "customer /admin blocked" $([ "$c" = "302" ] && echo 1) "got $c $loc"
c=$(curl -s -o /dev/null -w "%{http_code}" -H "cookie: bys_session=$CUST" "$BASE/supplier")
ok "customer /supplier blocked" $([ "$c" = "302" ] && echo 1) "got $c"
c=$(curl -s -o /dev/null -w "%{http_code}" -H "cookie: bys_session=$SUP" "$BASE/admin")
ok "supplier /admin blocked" $([ "$c" = "302" ] && echo 1) "got $c"
c=$(curl -s -o /dev/null -w "%{http_code}" -H "cookie: bys_session=$SUP" "$BASE/supplier")
ok "supplier /supplier allowed" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(curl -s -o /dev/null -w "%{http_code}" -H "cookie: bys_session=$ADM" "$BASE/admin")
ok "admin /admin allowed" $([ "$c" = "200" ] && echo 1) "got $c"
c=$(curl -s -o /dev/null -w "%{http_code}" -H "cookie: bys_session=$ADM" "$BASE/supplier")
ok "admin /supplier blocked" $([ "$c" = "302" ] && echo 1) "got $c"
c=$(curl -s -o /dev/null -w "%{http_code}" -H "cookie: bys_session=$CUST" "$BASE/login/")
ok "customer /login allowed" $([ "$c" = "200" ] && echo 1) "got $c"

# direct file bypass attempt (must also be gated)
c=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/admin/index.html")
ok "gating applies to /admin/index.html" $([ "$c" = "302" ] && echo 1) "got $c"

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" = "0" ]
