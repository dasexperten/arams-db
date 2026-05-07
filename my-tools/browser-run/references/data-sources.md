# Data Sources Reference — Browser Run

**Lazy-loaded reference for the `browser-run` skill.** Read this file only when you need to choose a source for a scraping task. Do not preload — the skill router will tell you when to consult this catalog.

This is the master catalog of free, public, no-login data sources that work through `browser-run-bridge` (Cloudflare Browser Rendering REST). Every source listed here has been verified to render through a headless Chrome session without authentication. Sources requiring login, API keys, or paid subscription are excluded by design.

---

## Table of Contents

1. [Routing rules — pick the right source](#routing-rules)
2. [Search engines](#search-engines)
3. [Russia & CIS](#russia--cis)
4. [Europe](#europe)
5. [North America](#north-america)
6. [Middle East & Gulf](#middle-east--gulf)
7. [South-East Asia & Asia-Pacific](#south-east-asia--asia-pacific)
8. [China & Greater China](#china--greater-china)
9. [Africa](#africa)
10. [Latin America](#latin-america)
11. [Cross-region universal sources](#cross-region-universal-sources)
12. [Industry-specific (oral care, cosmetics, B2B distributors)](#industry-specific)
13. [Legal & compliance (sanctions, IP, registries)](#legal--compliance)
14. [Social media & creator discovery](#social-media--creator-discovery)
15. [E-commerce & marketplaces](#e-commerce--marketplaces)
16. [Logistics & trade](#logistics--trade)
17. [Patents & IP](#patents--ip)
18. [Hard limitations — what does NOT work](#hard-limitations)

---

## Routing rules

Before picking a source, decide:

🔵 **Region first** — different countries have radically different best sources. Russian search → Yandex, not Google. Middle East B2B → DMCC/Yellowpages.ae, not LinkedIn. Africa → Facebook Pages + WhatsApp catalogs, not corporate sites.

🔵 **Source type second** — for any region: official registry > vertical aggregator > Maps > general search > social.

🔵 **Always start with DuckDuckGo `site:<domain>` query** — fastest way to discover whether a target site indexes the entity at all. Saves direct fetches to dead URLs.

🔵 **Mobile versions often work better than desktop** — `m.vk.com`, `m.facebook.com`, `mobile.twitter.com` skip much of the JS-heavy login wall and render full content. Use viewport `390x844` for mobile.

🔵 **Cloudflare datacenter IP is the visible identity** — Google blocks it (CAPTCHA), VK desktop blocks it (login wall), most others accept. When blocked, switch to alternative source.

🔵 **One URL per call** — `browser-run-bridge` has no batch mode. Caller orchestrates the loop, with min 11 second pause between calls (rate limit floor).

---

## Search engines

| Source | URL pattern | Best for | Caveats |
|---|---|---|---|
| **DuckDuckGo** | `https://duckduckgo.com/?q=...` | Universal — works from Cloudflare IPs | Limited result depth, max ~30 organic results |
| **Bing** | `https://www.bing.com/search?q=...` | Backup when DDG misses something | Sometimes asks "Are you human" |
| **Brave Search** | `https://search.brave.com/search?q=...` | Independent index, finds non-mainstream sites | Slower, smaller index |
| **Mojeek** | `https://www.mojeek.com/search?q=...` | UK independent index | Niche, useful as 3rd opinion |
| **Yandex Search** | `https://yandex.ru/search/?text=...` | Russian-language queries | Often the only place to find Russian regional businesses |
| **Baidu** | `https://www.baidu.com/s?wd=...` | Chinese language | Often blocks foreign IPs — use sparingly |
| **Naver** | `https://search.naver.com/search.naver?query=...` | Korean | Strong for South Korean B2B |

**Search operator that always works:** `site:domain.com query` — narrows to specific source. Critical for finding `site:vk.com`, `site:t.me`, `site:facebook.com`, `site:linkedin.com/company` listings without those sites' login walls.

---

## Russia & CIS

### Maps & directories
- **Yandex Maps** — `https://yandex.ru/maps/?text=<query>` (most complete for Russia/CIS)
- **2GIS** — `https://2gis.ru/<city>/search/<query>` (requires user-agent that 2GIS approves; partially works)
- **Google Maps** — gives 6-10 results without scroll for Russian cities

### Government & business registries
- **rusprofile.ru** — Russian companies, INN, OGRN, directors, beneficiaries, financial reporting
- **list-org.com** — alternative Russian company database
- **zachestnyibiznes.ru** — risk profiles of Russian companies, court cases
- **egrul.nalog.ru** — official Federal Tax Service registry (search by INN/OGRN)
- **fedresurs.ru** — bankruptcy filings, official corporate notices
- **nalog.gov.ru** — federal tax service portal
- **rospatent.gov.ru** — Russian patents and trademarks
- **roszdravnadzor.gov.ru** — medical/dental/pharmacy licensing

### Verticals
- **prodoctorov.ru** — clinics, doctors, reviews (medical/dental B2B targets)
- **zoon.ru** — universal local business directory (services, beauty, food)
- **napopravku.ru** — clinics by city
- **doctu.ru** — medical professionals
- **like.doctor** — clinic listings
- **spravker.ru** — old-school yellow pages by city (subdomain per city)
- **flamp.ru** — reviews + contacts

### Social
- **mobile VK** — `https://m.vk.com/<group_or_user>` — public groups visible without login (key insight)
- **Telegram preview** — `https://t.me/<channel>` — public channels show description + recent posts
- **Odnoklassniki** — `https://ok.ru/group/<id>` — older audience, but real businesses present

### Marketplaces
- **wildberries.ru** — product cards public
- **ozon.ru** — same
- **Yandex Market** — `market.yandex.ru`
- **Avito** — `avito.ru` — classifieds (B2B sales of equipment, used inventory)

---

## Europe

### EU-wide registries
- **GLEIF.org** — global LEI codes
- **OpenCorporates** — `opencorporates.com` — 220M+ companies, 140+ jurisdictions
- **EU Cosmetics Notification** — public CPNP entries
- **TMview** — `tmdn.org/tmview/` — EU trademark database

### Country-specific company registries
- **UK Companies House** — `find-and-update.company-information.service.gov.uk` (best in EU — full balance sheets free)
- **Germany Bundesanzeiger** — `bundesanzeiger.de` — German corporate filings
- **France Infogreffe** — `infogreffe.fr` — French commercial registry
- **Italy Registro Imprese** — `registroimprese.it`
- **Spain Registradores** — `registradores.org`
- **Netherlands KvK** — `kvk.nl` (limited free queries)
- **Poland eKRS** — `ekrs.ms.gov.pl`
- **Sweden Bolagsverket** — `bolagsverket.se`
- **Switzerland Zefix** — `zefix.ch`
- **Czech Republic Justice** — `justice.cz`
- **Austria Firmenbuch** — `firmenbuch.at`

### B2B & directories
- **Europages** — `europages.com` — pan-EU B2B
- **Kompass** — `kompass.com` — global, very strong in Europe
- **Wer liefert was** — `wlw.de` — German B2B directory
- **Pagine Gialle** — `paginegialle.it`

### Marketplaces (regional)
- **Amazon (per country domain)** — `.de`, `.fr`, `.it`, `.es`, `.nl`, `.pl`
- **Allegro** (Poland) — `allegro.pl`
- **eMag** (Romania, Bulgaria) — `emag.ro`
- **Bol.com** (NL/BE) — `bol.com`
- **Cdiscount** (France) — `cdiscount.com`
- **Boots.com** (UK pharmacy chain)
- **DM, Rossmann** (Germany drugstores) — `dm.de`, `rossmann.de`
- **Notino, Douglas** (cosmetics retailers) — `notino.com`, `douglas.com`

---

## North America

### USA
- **EDGAR (SEC)** — `sec.gov/edgar` — all US public companies, 10-K, 10-Q, beneficial ownership
- **OpenCorporates US** — state-level filings
- **Open Sanctions** — `opensanctions.org`
- **OFAC SDN** — `sanctionssearch.ofac.treas.gov`
- **USPTO** — `uspto.gov` — patents and trademarks
- **TESS** — `tmsearch.uspto.gov` — trademark search
- **FDA databases** — `fda.gov/drugs/drug-approvals-and-databases` (and cosmetics, devices)
- **PACER** (federal court records) — public, partial free access
- **State-level Secretary of State pages** — every state has online business search
- **Crunchbase** — `crunchbase.com/organization/<name>` — startups, funding rounds
- **ImportYeti** — `importyeti.com` — US customs records (who imports what from whom)
- **Yelp** — `yelp.com/biz/<slug>` — local businesses
- **Google Maps** — strongest in USA
- **Better Business Bureau** — `bbb.org`
- **Indeed company pages** — `indeed.com/cmp/<company>` — sometimes shows employee counts and reviews

### Canada
- **Corporations Canada** — `ic.gc.ca/app/scr/cc/CorporationsCanada`
- **Health Canada** — `health-products.canada.ca`
- **CIPO** — `ised-isde.canada.ca/cipo` (patents/trademarks)

### Mexico
- **RUG (Registro Único de Garantías)** — `rug.gob.mx`
- **SAT** — `sat.gob.mx` (tax registry, limited)

---

## Middle East & Gulf

### UAE
- **Dubai DED** — `ded.ae` — Department of Economic Development
- **DIFC Public Registry** — `difc.com/public-register`
- **DMCC** — `dmcc.ae` — Multi Commodities Centre registry
- **ADGM** — `adgm.com` — Abu Dhabi Global Market
- **Dubai Health Authority** — `dha.gov.ae` — clinic registry
- **MOHAP** — `mohap.gov.ae` — federal medical licensing
- **Yellowpages.ae** — local B2B directory
- **Noon.com** — Amazon-equivalent in UAE/KSA, product cards public
- **Namshi** — `namshi.com` — fashion/beauty

### Saudi Arabia
- **MCI** — `mci.gov.sa` — Ministry of Commerce (search in Arabic)
- **SFDA** — `sfda.gov.sa` — Saudi Food and Drug Authority registry
- **Tadawul** — `saudiexchange.sa` — public companies on Saudi stock exchange
- **Yellowpages.sa**
- **Noon.com KSA** — same platform, KSA tab

### Other Gulf
- **Qatar Financial Centre Authority (QFCA)** — public registry
- **Bahrain Investor Center** — `investinbahrain.com`
- **Kuwait Direct Investment** — `kdipa.gov.kw`
- **Oman Business Portal** — `business.gov.om`
- **Yellowpages** for `.qa`, `.bh`, `.kw`, `.om`

### Cross-Gulf / MENA
- **ZAWYA (Refinitiv)** — `zawya.com` — companies, news, contracts
- **Bayt.com** — largest MENA job portal — extract company structures
- **GulfTalent** — same use case
- **AMEinfo** — business news
- **Argaam** — Arabic financial data

### Israel
- **Israeli Companies Authority** — `data.gov.il/dataset/ica_companies`
- **Justice Ministry registry** — `justice.gov.il`

### Iran/Syria — DO NOT scrape due to sanctions

---

## South-East Asia & Asia-Pacific

### Singapore
- **ACRA Bizfile** — `bizfile.gov.sg` (free company search)
- **SGX** — Singapore Exchange listed companies
- **Watsons.com.sg** — drugstore retail (oral care SKUs visible)
- **Lazada SG** — marketplace

### Malaysia
- **SSM eInfo** — `ssm.com.my` (paid for full data, free preview)
- **JobStreet MY** — staff and employer pages
- **Lazada MY**, **Shopee MY**

### Thailand
- **DBD** — `dbd.go.th` — Department of Business Development (in Thai)
- **Ministry of Public Health Thailand** — `fda.moph.go.th`
- **Lazada TH**, **Shopee TH**
- **Watsons TH** — `watsons.co.th`

### Vietnam
- **Business Registration Portal** — `dichvuthongtin.dkkd.gov.vn`
- **Ministry of Health** — `moh.gov.vn`
- **Tiki** — `tiki.vn` — major marketplace
- **Sendo** — `sendo.vn`
- **Lazada VN**, **Shopee VN**
- **Zalo channels** (mobile only, harder to scrape)

### Indonesia
- **AHU** — `ahu.go.id` — Direktorat Jenderal Administrasi Hukum Umum
- **OSS** — `oss.go.id` — Online Single Submission registrations
- **Tokopedia** — `tokopedia.com`
- **Bukalapak** — `bukalapak.com`
- **Shopee ID**, **Lazada ID**

### Philippines
- **SEC Philippines** — `sec.gov.ph`
- **DTI Business Name** — `dti.gov.ph`
- **FDA Philippines** — `fda.gov.ph`
- **Lazada PH**, **Shopee PH**

### Australia & New Zealand
- **ASIC** — `asic.gov.au` — Australian Securities & Investments Commission
- **NZBN** — `nzbn.govt.nz` — NZ Business Number registry
- **TGA** — `tga.gov.au` — Therapeutic Goods Administration
- **IP Australia** — `ipaustralia.gov.au`

### Pan-Asia B2B
- **Made-in-China** — `made-in-china.com`
- **GlobalSources** — `globalsources.com`
- **TradeKey** — `tradekey.com`
- **EC21** — `ec21.com`
- **Tradeford** — `tradeford.com`

---

## China & Greater China

### Mainland China
- **Aiqicha** (Baidu) — `aiqicha.baidu.com` — company search (Chinese)
- **Tianyancha** — `tianyancha.com` — corporate intelligence (most data behind login but previews work)
- **Qichacha** — `qcc.com` — same niche
- **NMPA** — `nmpa.gov.cn` — National Medical Products Administration registry
- **CNIPA** — `cnipa.gov.cn` — patents and trademarks
- **AIC** (Administration for Industry and Commerce) — provincial portals
- **1688.com** — Alibaba's domestic B2B marketplace (Chinese language)
- **Made-in-China**, **Alibaba International** — already in pan-Asia list above

### Hong Kong
- **HK Companies Registry** — `cr.gov.hk`
- **HKEX** — `hkex.com.hk` — listed companies
- **Trademarks Registry** — `ipd.gov.hk`

### Taiwan
- **Department of Commerce** — `gcis.nat.gov.tw`
- **TIPO** — `tipo.gov.tw` (intellectual property)

### Marketplaces
- **Tmall** — `tmall.com` (premium Alibaba)
- **JD.com** — `jd.com`
- **Pinduoduo** — `pinduoduo.com` (less scrape-friendly)
- **Xiaohongshu** — `xiaohongshu.com` — discovery + creators (key for cosmetics/oral care)
- **Douyin (TikTok China)** — `douyin.com` — but heavy login wall

---

## Africa

### Generally available
- **Google Maps** — covers all major African capitals
- **Facebook Pages** — `facebook.com/<page>` — primary B2B identity in Africa, often more complete than corporate sites
- **WhatsApp Business catalogs** — `wa.me/<phone>` — public catalogs link from FB pages
- **DuckDuckGo `site:facebook.com <country> <category>`** — best discovery method for African B2B

### National registries
- **South Africa CIPC** — `cipc.co.za`
- **Nigeria CAC** — `cac.gov.ng` — Corporate Affairs Commission
- **Kenya BRS** — `brs.go.ke`
- **Egypt GAFI** — `gafi.gov.eg`
- **Morocco OMPIC** — `ompic.ma`
- **Tunisia Registre du Commerce** — `registre-commerce.tn`
- **Ghana RGD** — `rgd.gov.gh`

### B2B catalogs
- **Africa Business Pages** — `africa-business.com`
- **iAfrica** — South African focus
- **Konga, Jumia** — major African marketplaces (`konga.com`, `jumia.com.ng`, `jumia.co.ke`, etc.)
- **Takealot** — South African Amazon-equivalent

### Regulators
- **NAFDAC Nigeria** — `nafdac.gov.ng` — products registration
- **SAHPRA South Africa** — `sahpra.org.za`

**Reality check:** in most African countries outside RSA/Nigeria/Kenya/Egypt, B2B data online is sparse. Many SMEs operate WhatsApp-only. Best discovery flow: Google Maps → Facebook Page from Maps listing → WhatsApp link from Facebook.

---

## Latin America

### Brazil
- **Receita Federal CNPJ** — `receita.fazenda.gov.br`
- **JUCESP** (São Paulo registry) — `jucesponline.sp.gov.br`
- **ANVISA** — `anvisa.gov.br` — health products registry
- **INPI Brazil** — patents/trademarks
- **Mercado Livre** — `mercadolivre.com.br`

### Mexico, Argentina, Chile, Colombia, Peru
- **National registries** — every country has online business search
- **Mercado Libre regional domains** — `.com.mx`, `.com.ar`, `.cl`, `.com.co`
- **DataFiscal Argentina** — `cuitonline.com`
- **Servicio de Impuestos Internos Chile** — `sii.cl`

### Pan-LATAM
- **DDG `site:linkedin.com/company <country> <category>`** — works since LATAM LinkedIn presence is reasonable
- **EmpresasdeLatam** — pan-regional directory

---

## Cross-region universal sources

These work for any country, any company:

🔵 **OpenCorporates** — `opencorporates.com` — 220M companies, 140+ jurisdictions
🔵 **GLEIF** — `gleif.org` — Legal Entity Identifiers (required for trade contracts)
🔵 **OpenSanctions** — `opensanctions.org` — global sanctions intelligence
🔵 **Hunter.io company preview** — `hunter.io/companies/<domain>` — email patterns
🔵 **archive.org Wayback Machine** — `web.archive.org/web/*/<url>` — any site, any date in last 25 years
🔵 **archive.today** — `archive.ph` — alternative archiving service
🔵 **Crunchbase company pages** — `crunchbase.com/organization/<slug>`
🔵 **WHOIS via DDG** — `whois.com/whois/<domain>` — domain ownership

---

## Industry-specific

### Oral care, cosmetics, personal care
- **EU CPNP** (cosmetics notifications) — `ec.europa.eu/growth/sectors/cosmetics`
- **FDA cosmetics database** — `fda.gov/cosmetics`
- **NMPA China** — `nmpa.gov.cn`
- **SFDA Saudi Arabia** — `sfda.gov.sa`
- **TGA Australia** — `tga.gov.au`
- **iHerb** — `iherb.com` — premium personal care marketplace
- **Yesstyle, Stylevana** — Asian cosmetics
- **Notino**, **Douglas** — European cosmetics
- **Watsons** (regional domains) — pan-Asia drugstore
- **Boots.com** — UK
- **DM, Rossmann** — Germany
- **Mecca, Sephora** — premium beauty
- **Beautypedia** — `beautypedia.com` — ingredient analysis

### Healthcare and dental B2B
- **prodoctorov.ru** (Russia)
- **doctu.ru** (Russia)
- **napopravku.ru** (Russia)
- **doctolib.fr / .de** — clinic booking platforms (clinic listings public)
- **Practo** (India) — `practo.com`
- **ZocDoc** (US) — `zocdoc.com`

### Distributor and retailer discovery
- **Tradeford, Made-in-China, Alibaba** — already listed
- **PartnerVine, EuroDistributor** — pan-EU distributor networks
- **Distributors.com** — generic search

---

## Legal & compliance

- **OpenSanctions** — `opensanctions.org` (essential for legalizer skill)
- **OFAC SDN** — US sanctions
- **EU Sanctions Map** — `sanctionsmap.eu`
- **UK HMT Financial Sanctions Targets** — `assets.publishing.service.gov.uk`
- **UN Security Council Consolidated List** — `un.org/securitycouncil/content/un-sc-consolidated-list`
- **OFAC Specially Designated Nationals** — same as SDN
- **CIBPL** (Canada) — `sema-lmes.justice.gc.ca`
- **Open Ownership** — `openownership.org` — beneficial ownership

### Court records (US/UK)
- **PACER** — US federal courts (limited free)
- **CourtListener** — `courtlistener.com` — free wrapper
- **bailii.org** — UK court decisions

---

## Social media & creator discovery

### Public-without-login
- **mobile VK** — `m.vk.com/<group>` — full content
- **Telegram preview** — `t.me/<channel>` — channel previews + last 10-20 posts
- **Twitter via Nitter** — `nitter.net/<user>` (or any Nitter mirror — many exist)
- **Reddit (old.reddit.com)** — `old.reddit.com/r/<sub>` and `/user/<user>`
- **Mastodon instances** — `<instance>/@<user>`
- **Bluesky** — `bsky.app/profile/<handle>`
- **TikTok public profile** — `tiktok.com/@<handle>` — bio + bio link visible
- **YouTube channel about page** — `youtube.com/@<handle>/about`
- **Pinterest profile** — `pinterest.com/<user>` (boards public)
- **Xiaohongshu** — partial public access (Chinese market)

### Login-required (use sparingly through dedicated session work)
- **Instagram full content**
- **Facebook full feed (Facebook Pages still work logged-out)**
- **LinkedIn full profiles**
- **Douyin / Kuaishou** (Chinese TikTok analogs)

---

## E-commerce & marketplaces

(See per-region sections above for country-specific marketplaces. This subsection lists only the cross-cutting universal ones.)

- **Amazon** — `.com`, `.de`, `.fr`, `.it`, `.es`, `.co.uk`, `.ae`, `.sa`, `.in`, `.com.au`, `.co.jp`
- **eBay** — global
- **Etsy** — `etsy.com`
- **iHerb** — global personal care
- **Walmart** — `walmart.com`
- **Target** — `target.com`
- **AliExpress** — `aliexpress.com`
- **Shopify-store finders** — `shopstores.com`, `myip.ms` — find Shopify domains by signature

---

## Logistics & trade

- **MarineTraffic** — `marinetraffic.com` — vessel positions
- **VesselFinder** — `vesselfinder.com`
- **FlightRadar24** — `flightradar24.com`
- **ImportYeti** — `importyeti.com` — US customs records
- **PIERS** — partial free
- **Searates** — `searates.com` — public freight rates
- **Cargo Rules** — `cargo-rules.com` — shipping regulations

---

## Patents & IP

- **Google Patents** — `patents.google.com` — full-text, global
- **Espacenet (EPO)** — `worldwide.espacenet.com`
- **WIPO Patentscope** — `patentscope.wipo.int`
- **USPTO** — `uspto.gov`
- **CNIPA** — `cnipa.gov.cn` (China)
- **JPO** — `jpo.go.jp` (Japan)
- **KIPO** — `kipo.go.kr` (Korea)
- **TMview** — `tmdn.org/tmview`
- **Madrid Monitor** — `wipo.int/madrid/monitor`
- **EUIPO** — `euipo.europa.eu`
- **Rospatent** — `rospatent.gov.ru`

---

## Hard limitations

These tasks **cannot** be performed reliably with `browser-run-bridge` in current form (no scroll, no click, no session, no custom UA):

🔴 **Mass marketplace scraping at scale** — Wildberries/Ozon/Amazon listings beyond first page (requires scroll), entire seller catalogs (requires pagination clicks). Use Apify with marketplace-specific actors.

🔴 **LinkedIn deep profiles, posts, network maps** — login wall + active anti-bot. Use Apify LinkedIn actors or manual.

🔴 **Instagram, Facebook private/restricted content** — login required. Public Pages work.

🔴 **Google Search SERPs** — Cloudflare datacenter IPs trigger CAPTCHA. Use DuckDuckGo, Bing, Brave, or Yandex.

🔴 **Sites requiring custom user-agent** (e.g., 2GIS, some Baidu pages) — Quick Actions API does not let us set UA. Workaround: use alternative source.

🔴 **JavaScript form submission, multi-step navigation** — current actions are `screenshot` and `extract_text` only. Future `click`, `fill`, `wait_for_selector` actions would unblock this.

🔴 **CAPTCHA-protected pages** — no bypass. Try mobile version first; if still blocked, manual.

🔴 **Pages requiring cookies persistence across requests** — each call is stateless. Future `session` action would unblock.

🔴 **Pages with aggressive rate limits** (Cloudflare WAF, Imperva, Akamai bot management at strict tiers) — blocks Cloudflare datacenter IPs. Workaround: alternative source.

🔴 **Real-time stream data** (live stock, live sports) — single fetch is a snapshot, not stream.

🔴 **PDF rendering** — `screenshot` action returns the PDF rendered as page image (works), but extracting structured PDF text is not yet a Browser Run action. Use direct `fetch` + PDF parser instead.

---

## When this catalog is insufficient

If a task requires data that is not reachable through any source listed above, escalate via the routing rule:

1. **Confirm with operator** that the data is genuinely needed (sometimes proxy data exists)
2. **Propose Apify** as the next-tier option if a relevant actor exists
3. **Propose extending Browser Run** with a new action (`click`, `scroll`, `session`, `set_user_agent`) if the gap is structural
4. **Propose manual collection** if the source is fundamentally login-gated (e.g., LinkedIn premium data)

Never silently fall back to fabricating contacts. Empty result is always preferable to invented data.

---

## Maintenance

This catalog is a living document. When a new working source is verified, append it to the relevant region/category section. When a previously listed source breaks (Cloudflare blocks, login wall added, domain dies), mark with `⚠️ broken (date, reason)` rather than removing — historical context helps debug regression.

Last verified comprehensive: 2026-05-07
Next review: 2026-08-07 (quarterly)
