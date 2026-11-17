# Call of Cody - Arena Shooter

Multiplayer third-person shooter in de browser. Speel met 2 tot 8 spelers, of alleen tegen bots.
Met lobby, 6 wapens, 10 skins, bots met 3 moeilijkheden, wedstrijden tot 3/5/7 gewonnen rondes,
instellingen, pauzemenu en besturing voor zowel pc als telefoon (NL/EN).

## Zo zet je het online (stap voor stap)

### Deel 1 - Code in GitHub zetten
1. Pak de zip uit op je pc. Je krijgt een map `arena-shooter` met o.a. `server.js`, `package.json` en een map `public`.
2. Ga naar github.com en log in. Klik rechtsboven op **+** en dan **New repository**.
3. Naam: `arena-shooter`. Kies **Public** of **Private** (beide werken). Klik **Create repository**.
4. Op de nieuwe, lege pagina: klik op **uploading an existing file**.
5. Sleep de **inhoud** van de uitgepakte map (`server.js`, `package.json`, `render.yaml`, `README.md` en de map `public`) in het venster. Sleep dus niet de map `arena-shooter` zelf.
6. Wacht tot alles geladen is en klik onderaan op **Commit changes**.
7. Controleer dat je in de repository `server.js` ziet, en een map `public` met daarin `index.html`, `game.js`, `shared.js` en `style.css`.

### Deel 2 - Server starten op Render (gratis)
1. Ga naar render.com en kies **Get Started** / **Sign in with GitHub**. Geef Render toegang tot je repository `arena-shooter`.
2. Klik **New +** en dan **Web Service**. Kies je repository `arena-shooter`.
3. Vul in:
   - **Language**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Klik **Create Web Service**. Na 1 tot 3 minuten staat er bovenaan een link zoals `https://arena-shooter-xxxx.onrender.com`.
5. Open die link op je telefoon: dat is je spel.

### Deel 3 - Spelen met vrienden
1. Eén speler kiest **Nieuw spel maken** en krijgt een code van 4 letters.
2. Anderen vullen die code in bij **Meedoen**, of openen de link via de knop **Link delen**.
3. Kies in de lobby je wapen. De host drukt op **Start spel**.
4. Alleen? Dan vullen 5 bots het spel aan.

### Later aanpassen
Wijzig een bestand op GitHub (potlood-icoon, **Commit changes**). Render zet de nieuwe versie automatisch online.

## Besturing
- **Telefoon**: linkerduim = lopen (joystick verschijnt waar je aanraakt), rechterduim vegen = kijken, rode knop = vuur,
  knoppen **SPRING / BUK / LIG** naast de vuurknop, joystick naar de ladder toe = klimmen.
- **Pc**: klik in het scherm om de muis te vangen, dan WASD/pijltjes = lopen, muis = kijken, linkermuisknop = vuur,
  **spatie = springen**, **C = hurken** aan/uit, **Z of Ctrl = liggen** aan/uit, W/S bij een ladder = omhoog/omlaag,
  **E = deur open/dicht** (als je bij een deur staat en ernaar kijkt) of bot overnemen als je uit bent, Esc = pauzemenu.
- **Deuren (telefoon)**: sta je bij een deur, dan verschijnt de oranje knop **DEUR** links van de vuurknop.
- **Camera eerste/derde persoon** [FPS]: pc = toets **V**, telefoon = oog-knop **👁 3P/1P** rechtsboven, of Instellingen > Camera
  (Derde persoon / Eerste persoon, standaard derde persoon, bewaard in `cc_settings`). In eerste persoon zie je je eigen wapen met handen;
  schieten gaat vanaf je oog recht naar het kruisje. Uitgeschakeld/meekijken blijft derde persoon; VR is altijd eerste persoon.
  Code: `public/fps.js` (camera + viewmodel in een eigen scene, na de wereld getekend zodat het nooit door muren steekt) en `public/fps-core.js` (pure functies, `node tools/test_fps.mjs`).
- **Mes, medkit, finisher** [MES]: inventaris met 3 vakken (1 = wapen uit de lobby, 2 = mes, 3 = medkit). Pc: **1/2/3** kiezen,
  klik = schieten / steken / medkit, **Q** = snelle messteek vanuit elk vak, **H** = medkit, **F** = finisher. Telefoon: vakjes boven de
  levensbalk en een rode knop **FINISH** als een finisher kan. VR: geen invoer hiervoor (wel te steken/finishen).
  Server-gezag (`server.js` meleeAttack/startHeal/startFinisher, regels in `Shared.MELEE/MEDKIT/FINISH`, `meleeTarget`, `canFinish`):
  mes 2 m (3D, borsthoogte per houding), kegel ~50° + lichaamsbreedte, vrije lijn (ook deuren), 55 schade, in de rug 100, 0,45 s cooldown,
  ×1,1 loopsnelheid, 10 schade aan een dichte deur. Medkit 1 per ronde, 1,5 s, +60 hp (wisselen/schieten breekt af).
  Finisher ≤1,8 m, ±0,6 m hoogte, slachtoffer ≤35 hp of van achteren, beide 1,2 s vast, aanvaller dood = afgebroken, daarna kill met
  `fin:1` (feed "X finisht Y") en +15 hp. Berichten: `slot`, `melee`, `heal`, `finish` → `swing`, `heal`, `healed`, `finish`;
  slot/medkit/finisher zitten als bits 16/32/64/128 in de houding-vlaggen van de snapshot. Test: `node tools/test_melee.js`
  (zet `TEST_HOOKS=1` voor het `dbg`-bericht).
- **Menu-knop (☰) / Esc**: pauzemenu met Verder spelen, Instellingen, Besturing, Volledig scherm en Spel verlaten. Het spel loopt door voor de anderen.
- **Instellingen** (ook in het hoofdmenu): muis- en touch-gevoeligheid, Y-as omkeren, gezichtsveld, graphics (Laag/Middel/Hoog/Auto), volume, FPS-teller en taal. Ze worden in de browser bewaard. Bij "Auto" gaat de grafische kwaliteit vanzelf omlaag als het spel hapert.
- **Inzoomen** (sniper en precisiegeweer): pc = rechtermuisknop vasthouden, telefoon = knop **ZOOM** boven de vuurknop (aan/uit). De sniper is zonder inzoomen onnauwkeurig.
- **Meta Quest 3 (VR)**: open de https-link in de Quest Browser, maak/zoek een spel en druk in de lobby (of in het spel) op **VR STARTEN**.
  HP en stand staan op je pols (de hand zonder geweer). Code: `public/vr.js`, `public/vr-core.js`, `public/vr-menu.js`, `public/vr-menu-core.js`.

  | Knop (rechtshandig) | Wat |
  |---|---|
  | Linkerstick | Lopen (in de kijkrichting) |
  | Rechterstick | Draaien (stapjes 15/30/45° of vloeiend) |
  | Rechtertrekker | Vuren (richten met het geweer in je rechterhand) |
  | Grip linkerhand bij het voorhout | Geweer met **twee handen** vasthouden |
  | A | Start (host, in de lobby) / deur open/dicht (levend, bij een deur; anders niets) / bot overnemen (na uitschakeling) |
  | B | Draaien: stapjes / vloeiend |
  | X | Springen |
  | Loopstick indrukken | Liggen aan/uit |
  | Echt bukken (hoofd lager dan 1,2 m) | Gehurkt |
  | Y kort | Comfort-vignet aan/uit |
  | **Y lang (0,6 s)** of **MENU-knop op je pols** (richten + trekker) | VR-menu openen/sluiten |
  | Meta-knop | VR verlaten (systeem) |

  - **Linkshandig** (menu > Wapen > Schiethand: Links): geweer en vuren in de linkerhand, lopen met de rechterstick,
    draaien met de linkerstick, polspaneel op de rechterhand. De knoppen A/B/X/Y blijven op hun plek.
  - **VR-menu**: een paneel ~1 m voor je op borsthoogte dat blijft staan. Richten met de laser van een van beide controllers,
    trekker = klikken (met een tikje trilling). Het spel loopt door (je staat stil en kunt niet schieten zolang het menu open is).
    Tabs: *Comfort* (draaien stapjes/vloeiend, stapgrootte, draaisnelheid, comfort-vignet, zittend spelen, hoogte +/- 10 cm),
    *Wapen* (schiethand, twee handen: Vasthouden / Aan-uit / Uit), *Beeld & geluid* (graphics Laag/Middel/Hoog/Auto, volume, taal NL/EN)
    en *Besturing* (dit overzicht). Onderaan: Verder, VR verlaten, Spel verlaten (met bevestiging).
    Alles wordt bewaard in dezelfde instellingen als op de pc (`cc_settings`, VR-deel onder `vr`).
  - **Twee handen**: houd je andere hand bij het voorhout (pomp/voorgreep) van het geweer en knijp de grip-knop in. Het geweer blijft
    in je schiethand, maar de loop wijst van je schiethand naar je steunhand (zoals echt). Er verschijnt een handschoen op het voorhout,
    een oranje ring laat zien wanneer je dichtbij genoeg bent. *Vasthouden* = zolang je knijpt, *Aan/uit* = knijp om te pakken en
    nog eens om los te laten, *Uit* = altijd één hand. Met twee handen is richten iets rustiger en de spreiding iets kleiner (x0,85);
    de sniper telt dan als "door de kijker" (VR heeft geen zoom).
  - **Zittend spelen**: zet *Zittend spelen* aan (+45 cm) en stel met *Hoogte* fijn af. Gehurkt tellen gebeurt met deze correctie erbij,
    dus zittend tel je niet automatisch als gehurkt.

## Springen, hurken, liggen en klimmen
- **Springen** (~1.2 m hoog): op kisten (1 hoog), over lage dekking en over de borstwering van een wachttoren. Dubbele kisten en containers zijn te hoog; over aaneengesloten containers kun je lopen.
- **Hurken**: 55% loopsnelheid, lagere hitbox (hoofd ~1.1 m), nauwkeuriger (spreiding x0.65). **Liggen**: kruipen (25%), hitbox laag bij de grond (lage dekking verbergt je helemaal), spreiding x0.45. In de lucht schiet je onnauwkeuriger (x1.8).
- **Wachttorens**: loop naar de ladder toe om te klimmen (2.5 m/s), bovenaan stap je door de opening in de borstwering het platform op. De borstwering (0.9 m) houdt je op het platform en houdt kogels tegen: hurk erachter. Naar beneden: terug naar de ladderopening lopen, of over de borstwering springen (geen valschade).
- **Ladders in gebouwen** (hoog woestijngebouw naar de verdieping, klokkentoren van de kerk naar de klokkenzolder op 9,6 m): loop naar de ladder toe om te klimmen; bovenaan stap je (achteruit, van de muur af) de verdiepingsvloer op. Naar beneden: vanaf de vloer naar het gat met de ladder lopen en doorlopen; terug omhoog = de andere kant op. Onder een verdiepingsvloer loop je gewoon door, op de vloer kun je staan.
- **Deuren en hoogte**: een dichte deur blokkeert ook in de 3D-botsing (`collideY`, dus client-voorspelling, server-controle en bots); open of kapot kun je erdoor. Wie op een dak of verdieping boven de deur staat, telt niet als "in de deuropening" en kan de deur daar ook niet bedienen.
- Alles wat met hoogte te maken heeft staat in `public/shared.js` (`MOVE`, `supportHeight`, `collideY`, `stepPlayer`, `validateState`). De client voorspelt de beweging, de server controleert hoogte en houding (alleen op een ondergrond, op een ladder of binnen een sprongboog met zwaartekracht; houding hooguit elke 200 ms wisselen) en stuurt `y` + houding mee in de snapshots.
- Bots hurken soms achter lage dekking (normaal/moeilijk), gaan op afstand liggen met een sniper/precisiegeweer, springen op een kist als ze vastlopen en richten op de juiste hoogte (torens, containers, liggende spelers).
- Toren opnieuw bouwen (alleen de toren): `ONLY=tower` als omgevingsvariabele bij `tools/build_models.py`.

## Wapens (fase 2)
Zes wapens, elk met een eigen rol (waarden in `public/shared.js`, `WEAPONS`):
aanvalsgeweer (allround), shotgun (heel dichtbij), machinepistool (dichtbij, snel lopen),
licht machinegeweer (veel kogels, grote spreiding, trager lopen), precisiegeweer (halfautomaat, lichte zoom)
en sniper (2 treffers, grote zoom, trager lopen).

## Skins (fase 2)
Tien skins: Bossoldaat, Schaduwschild (eigen ontwerp: schildpad-achtige ninja in zwart pak met schild op de rug),
Zandstorm, Sneeuwwacht, Stadsgrijs, Nachtwacht, Pixelmarine, Tijgerstreep, Pantser en Sluipschutter.

## Goed om te weten
- De gratis Render-server gaat na ongeveer 15 minuten zonder bezoek slapen. De eerste keer openen duurt dan ongeveer een minuut. Open het spel dus even voordat je vrienden uitnodigt.
- Het spel laadt de 3D-bibliotheek Three.js via een CDN (internet nodig, normaal gesproken geen probleem).
- Je kunt ook lokaal testen: installeer Node.js (versie 18 of hoger), open een terminal in de map en typ `node server.js`. Ga dan naar http://localhost:3000. Op je telefoon (zelfde wifi) werkt `http://IP-VAN-JE-PC:3000`.

## Spelverloop
- De host kiest in de lobby de **moeilijkheid** van de bots (Makkelijk / Normaal / Moeilijk) en het aantal **rondes om te winnen** (3, 5 of 7).
- Na de aftelling zijn alle spelers 2 seconden **beschermd** (blauw schild).
- Wie als eerste het aantal rondes wint, wint de wedstrijd. Daarna volgt een eindscherm met ranglijst en gaat iedereen terug naar de lobby.

## 3D-modellen (Blender)
De soldaat, wapens, bomen, kratten, zandzakken, uitkijktoren en rotsen worden gemaakt met een Blender-script en staan als `.glb` in `public/models/`.
- Opnieuw bouwen: `"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b --factory-startup --python tools/build_models.py`
- Extra wapens (smg, sniper, lmg, dmr): `"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b --factory-startup --python tools/build_weapons.py`
- Skins: `tools/build_skins.py` bouwt de extra skin-modellen (`shellninja`, `heavy`, `scout`, `ghillie`) en de camo-texturen in `public/models/skins/`. `tools/render_skins.py` maakt previews en de plaatjes voor de skin-keuze in de lobby (`thumb_<id>.jpg`). De lijst met 10 skins staat in `public/shared.js` (`SKINS`).
- Gebouwen (holle blokhut, deuren, meubels, lantaarn): `"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b --factory-startup --python tools/build_buildings.py`
- Modellen voor de extra levels (containers, vaten, kraan, lantaarnpaal, palm, besneeuwde den, puin, autowrak, schip, ...): `"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b --factory-startup --python tools/build_levels.py`
- Voorbeeldplaatjes: `tools/render_previews.py` (resultaat in `tools/previews/`).
- Belangrijk: de game rekent op vaste namen in de modellen (`legL`, `legR`, `body`, `trunk`, `foliage`, materiaal `Tint` voor de teamkleur). Verander die niet zonder ook `public/game.js` aan te passen.

## Levels
Na elke ronde wisselt het level: Bos met heuvels, Woestijnpost, Besneeuwde bergpas, Verwoest dorp, Haven bij nacht (daarna weer het bos). Elke wedstrijd begint in het bos.
De levels worden met een vaste seed gemaakt in `public/shared.js` (`LEVEL_DEFS[..].generate`), zodat server en browser precies dezelfde wereld hebben.

## Gebouwen en deuren
In elk level (behalve het bos) kun je de gebouwen in. Alle gebouwen zijn hol, met echte deuren die je opent/sluit (E / DEUR / VR A) of kapotschiet.
- **Bergpas**: 9 blokhutten (houten deur, 3 ramen, schuin dak, plankenvloer, stapelbed, tafel met lantaarn, kachel, kist). De grond onder elke hut is vlak gemaakt (een 'pad' in `heightAt`).
- **Woestijnpost**: hoofdgebouw (hoog deel met ladder naar de verdieping en een deur naar het platte dak van het lage deel), bijgebouw en 5 lemen hutjes, elk met deur, ramen en meubels. De kapotte huisjes zonder dak hebben open deuropeningen.
- **Verwoest dorp**: alle huizen met een hele muur bij de deur krijgen dubbele houten deuren, binnen kisten/tafels/kasten/puin. De kerk heeft dubbele deuren in het portaal en de zijdeur, kerkbanken, en een holle klokkentoren met ladder naar de klokkenzolder.
- **Haven**: loods B (twee roldeuren, een stalen loopdeur, hoge ramen, containers binnen) en twee kantoren (stalen deur, ramen, bureau, kast). Loods A was al open.
- **Deuren**: de server bepaalt alles. Per ronde zijn alle deuren dicht (hout 60 hp, staal 90, roldeur 150). Een deur gaat open van je af (of de andere kant op als daar iemand staat), gaat niet dicht als er iemand in de deuropening staat, houdt kogels tegen en gaat na genoeg treffers kapot (splinters). Bots doen deuren open, schieten op deuren als er iemand achter zit, en vluchten gewond een gebouw in (normaal/moeilijk).
- **Code**: `public/shared.js` (`g.building`, `g.hut`, `cabinGroup`, deur-regels `doorUse`, botsing `doorPush`, stralen `rayDoorHit`), `public/doors.js` (client: deurbladen, lantaarns, ladders, geluid, splinters, hint/knop), `server.js` (bericht `door`, schade in `fire()`, bots). Modellen: `tools/build_buildings.py`.

## Testen
- `node tools/test_shared.js` controleert botsingen, dekking en schietlijnen in de gedeelde spelregels, de verticale beweging (springen, kisten, containers, ladders, borstwering, hitboxen per houding, servercontrole),
  de gebouwen en deuren (dicht/open/kapot voor lopen en kogels, regels voor openen/sluiten, bot-routes) en de combinatie: deuren in de 3D-botsing en servercontrole, verdiepingsladders, lopen onder een verdiepingsvloer.
- `node tools/test_weapons.js` controleert de wapenwaarden en modellen.
- `node tools/test_doors_server.js` start de server op een eigen poort en test de deuren als client (open/dicht, te ver weg, niet dicht op een speler, stukschieten) en kijkt wat bots met deuren doen.
- `node tools/test_vr.mjs` controleert de VR-besturing (controllers -> invoer, Y kort/lang, linkshandig, springen/liggen), richting/rig-wiskunde,
  twee handen (richting, steunpunten per wapen, vasthouden/aan-uit/uit), het VR-menu (opbouw, laser-raaktest, keuzes), faden en het tekenen van de VR-HUD.

- `node tools/test_fps.mjs` controleert de eerste-persoonscamera (camerastand, ooghoogte, treden, viewmodel-poses per wapen/houding, bob, terugslag, handen).

## Plan
1. **Fase 1 (nu)**: prototype, 1 level, 2 wapens, 1 skin
2. Fase 2: alle wapens en alle 10 skins
3. Fase 3: alle 5 levels en wisselen na elke ronde
4. Fase 4: afwerking en pc-versie
5. Fase 5: Meta Quest 3 (WebXR)
