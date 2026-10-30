OSOBNÉ PROJEKTY — PRODUKČNÁ VERZIA 0.6 PWA
Dátum zostavenia: 28. 10. 2026

OBSAH
- Nadstavba pôvodnej aplikácie v0.5, nie nový projekt.
- Identický vzhľad a existujúce funkcie správy kategórií, projektov, úloh,
  termínov, poznámok, hľadania a importu/exportu JSON.
- Google Firebase Authentication, Cloud Firestore; oddeľovanie údajov UID.
- Automatická synchronizácia, lokálne ukladanie, záznamy zmien a konflikty.
- Pri konflikte sa tlačidlo Firebase zafarbí na červeno.
- Pôvodné Google Drive synchronizačné súbory ostávajú ako nepoužívaná záloha;
  cloud-sync.js sa v tejto verzii nenačítava.
- Push notifikácie ešte NIE SÚ implementované.

ODDELENIE TESTU A PRODUKCIE
- Produkčné cloudové dáta: /users/{uid}/changes/{revisionId}
- Testovacie cloudové dáta: /users/{uid}/testChanges/{revisionId}
- Produkčné lokálne údaje sú oddelené od testovacích podľa UID.
- Stará lokálna databáza v0.5 (inventar-projektov-v1) ostáva nedotknutá.
- Originálne dáta používateľa sa do v0.6 automaticky nekopírujú.
- Každý účet začína bez projektov, kým sa v novom prostredí nevytvoria
  záznamy alebo používateľ vedome nenaimportuje JSON.

NASADENIE (vlastník)
1. Ponechaj si poslednú zálohu JSON, zdrojový ZIP v0.5 a testovací ZIP.
2. Nahraj všetky súbory TOHTO balíka do koreňa pôvodného GitHub repozitára
   https://github.com/Suter1971/inventar-projektov (nie do testovacieho).
   Súbory treba prepisovať, nie vytvoriť vnorený priečinok.
3. Po zverejnení otvor https://suter1971.github.io/inventar-projektov/
   a prihlás sa svojim Google účtom.
4. Len na jednom zariadení naimportuj súbor JSON, potom sa majú objaviť
   9 kategórií, 32 projektov a 3 úlohy (podľa zálohy z 28.10.2026).
5. Neimportuj JSON opakovane na ďalších zariadeniach. Tie sa synchronizujú samy.
6. Pôvodný Google Disk nevymazávaj, kým si neoveríš, že ostré dáta sú dostupné.

PRE ALLANA
- Tá istá adresa aplikácie, ale iný Google účet a vlastné údaje.
- Pri prvom prihlásení sa objaví prázdna inventúra. Žiadny import Tiborovho JSON.
- iPhone: otvor adresu v Safari, cez Zdieľať -> Pridať na plochu
  a spusti ikonou. Na iOS prihlásenie a prevádzku ešte treba overiť.
- Windows: použitie cez bežný webový prehliadač alebo inštaláciu PWA.

DÔLEŽITÉ
- Pred prvou synchronizáciou na novom zariadení je potrebný internet.
- Zmeny bez internetu sa držia lokálne; synchronizácia prebehne po návrate online.
- Ak sa zobrazí červené tlačidlo Firebase, cezň sa rieši konflikt.
- Firestore bezpečnostné pravidlá pre /users/{userId}/... už boli nastavené
  v konzole. Aplikácia ich nemení ani nezverejňuje iným používateľom dáta.
- Skúšobné testy prešli na PC a Androide, iPhone ešte nebol odskúšaný.
- Pri väčšom množstve zmien histórie bude v budúcnosti vhodné riešiť archiváciu;
  na súčasné osobné používanie toto nie je blokujúce.
