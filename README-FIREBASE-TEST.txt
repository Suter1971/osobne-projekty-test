OSOBNÉ PROJEKTY — FIREBASE v0.6 TEST (28. 10. 2026)

Toto je skúšobná, nie produkčná verzia pôvodnej PWA.

Zachované: kategórie, projekty, úlohy, termíny, filtre, vyhľadávanie,
import/export JSON, schválené ikony, pôvodný vzhľad a pôvodný formát JSON.

Pridané: Firebase Google prihlásenie, oddelená lokálna inventúra podľa UID,
príjem cloudových zmien, lokálne uchovávanie čakajúcich zmien, automatická
synchronizácia jednotlivých zmien a detekcia súbežných úprav.

Údaje v ostrej verzii: /users/{uid}/changes/{revisionId}.
Údaje v testovacej verzii: /users/{uid}/testChanges/{revisionId}.
Tento balík má režim TEST zapnutý napevno – nech sa súbory nechtiac
dostanú kamkoľvek, do ostrej kolekcie changes nepíšu.
Oddelené sú aj lokálne úložiská jednotlivých režimov. Každá revízia je
samostatný dokument. Súbežné úpravy rovnakého záznamu sa automaticky
neprepisujú, ale vyžadujú výber používateľom.

DÔLEŽITÉ
- Offline cache testovacej PWA je oddelená od cache ostrej PWA.
- Nasadzovať najprv IBA na oddelené testovacie URL. Odporúčané:
  samostatný GitHub repozitár osobne-projekty-test (GitHub Pages).
- Zatiaľ NAHRÁVAŤ ANI NEPREPISOVAŤ hlavnú index.html v koreňovom adresári.
- Pôvodný lokálny kľúč inventar-projektov-v1 ostáva nedotknutý.
- Pôvodný Google Disk zostáva nedotknutý a cloud-sync.js je v balíku ponechaný,
  ale nová verzia ho vôbec nespúšťa.
- Nová verzia začína po prihlásení prázdna. Údaje sa importujú výhradne
  vedome, cez existujúci Import JSON, až v dohodnutom migračnom kroku.
- Počas skúšok nepracovať súčasne v ostrej aj skúšobnej verzii s tými istými
  ostrými údajmi bez plánovanej migrácie.
- Prvé prihlásenie na novom zariadení vyžaduje internet.
- SDK sa sťahuje cez Google CDN a service worker sa ho pokúša ukladať do
  offline cache; spoľahlivosť spustenia po vypnutí internetu musíme otestovať.
- Google prihlásenie cez popup je nutné reálne otestovať na iPhone PWA.
- Na push notifikáciách sa zatiaľ NEPRACOVALO.
- Táto verzia nemá za sebou reálny test proti Firebase serveru ani test na
  mobiloch; bez nich ju neoznačujeme za dokončenú.

Pri uvažovaní o ostrej migrácii najprv zabezpečiť novú zálohu JSON.

Interný Firebase projekt sa naďalej volá Inventar projektov;
verejný názov PWA je Osobné projekty.
