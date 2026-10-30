OSOBNE PROJEKTY – TEST 0.7.3 / BALIK 24

Nahraj cely rozbaleny obsah ZIPu do repozitara osobne-projekty-test.
DO OSTRÉHO inventar-projektov NIC NENAHRAVAJ.

ZMENY oproti baliku 22:
- firebase-sync.js: jednorazova ziadost o povolenie pri kliknuti, rozlisenie
  granted/default/denied, sledovanie neskorsieho povolenia, ochrana pred
  duplictnou registraciou a spravne hlasky pri zamietnuti.
- index.html: viditelne cislo 0.7.3 TEST a verzovany JS skript.
- service-worker.js: nove meno cache na nacitanie opravy.

Nezmenene: databazova synchronizacia, prihlasenie, projekty, ulohy,
firestore kolekcie, PWA identifikator, manifest, offline pristup a emailove nastavenia.

CO TENTO BALIK NEROBI:
- Nefalšuje povolenie na notifikacie, ak ho prehliadac naozaj zamietol.
- Nezapina serverove odosielanie ani pondelkove e-maily.
- Nezasahuje do ostrych dat ani 0.7 produkcie.

ODOVZDANIE: realne dorucenie push bez aktivneho servera nie je mozno overit.
Kriticke je povolenie a FCM registracia; jeden cieleny Android test staci.
