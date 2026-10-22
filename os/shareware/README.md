# Shareware (`/os/shareware/`)

Original shareware releases that LövOS can install with one click (`games.json` → `shareware`). Each archive is kept byte-for-byte as it was released: the shareware licences only allow sharing them complete and unaltered, so never repack, rename the files inside or add to them. `installShareware()` in `js/games.js` checks the size and SHA-256 before installing, and a test checks them against `games.json`.

| File | What | Size | SHA-256 |
| --- | --- | --- | --- |
| `jazz.zip` | Jazz Jackrabbit shareware episode v1.0, Epic MegaGames, 1 August 1994 (the release listed by [RGB Classic Games](https://www.classicdosgames.com/game/Jazz_Jackrabbit.html) as `jazz.zip`) | 1,417,337 bytes | `b35114020f278432e1f06fc92b76e168e058ea1aecdc4b00bca76ab78499d455` |

## Licence

`LICENSE.DOC` inside the archive allows online services to distribute the game "as long as no files are altered or removed", for free. LövOS meets the conditions that come with it: it credits Epic MegaGames as the publisher and owner, identifies the game as shareware and explains the try-before-you-buy idea (on the install screen, from `games.json` → `notice`), and charges nothing. Epic MegaGames (now Epic Games) can end the licence with notice; if they do, delete the archive and the `shareware` entry in `games.json`.

The archive is downloaded only when someone chooses to play the shareware episode, so it isn't in the service worker's precache.
