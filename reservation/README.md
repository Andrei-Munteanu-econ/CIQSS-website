# Lab computer booking — setup guide

## Current installation (CIQSS)

- **Booking site:** https://script.google.com/macros/s/AKfycbzgE_lN2AWzTbcQvCm7bzf5fy8uheLRnaHcGYSW-6leyserfmL2deMPDPPlGUmqa-xu/exec
- **Owner account:** reservation.ciqss.uqam@gmail.com (owns the spreadsheet, the script, the deployment and sends all emails)
- **Spreadsheet:** "CIQSS booking" in that account's Google Drive. The script is under Extensions → Apps Script.
- **Live version:** 9 (Nov 5, 2026: per-day opening hours; version 8 added admin bookings and blocks, the settings page and computer management).
- **Script ID:** `1ylQ1ksWDsqL7IEIOMiJWggh7urai7odijEbLlaDj2pYfBnrIfrKj3WXq`. **Deployment ID** (the live URL): `AKfycbzgE_lN2AWzTbcQvCm7bzf5fy8uheLRnaHcGYSW-6leyserfmL2deMPDPPlGUmqa-xu`.
- **To update the code**, either:
  - **Command line (clasp)**, logged in as the owner account: `clasp clone <script ID>` into an empty folder, copy `Code.gs` → `Code.js` and `Index_2.html` → `Index.html`, then `clasp push --force` and `clasp deploy -i <deployment ID> -d "what changed"`.
  - **Editor:** paste the new files, save, then Deploy → Manage deployments → pencil → Version: New version → Deploy.

  Either way the URL stays the same. To roll back, point the deployment at an earlier version (Manage deployments → pencil → pick the version).
- **Don't sign the owner account into your everyday browser.** Google then sends the booking link to that account, and when it isn't the browser's first account the page shows "Sorry, unable to open the file". Use a private window or a separate browser profile for it. Researchers are not affected.

## Admin tasks

- **See all bookings:** sign in on the site with an address listed in Config → ADMIN_EMAILS. You get a "Toutes les réservations (admin)" tab, and names appear on taken slots in the "Horaire" grid.
- **Add a booking:** click any empty slot in "Horaire" (unavailable computers included), or use "+ Ajouter une réservation" in the admin tab. Choose the date, computer, start and end, and who it is for:
  - *Moi-même*: yourself.
  - *Une autre personne*: type their email. They don't need to be registered. Tick "Aviser la personne par courriel" to send them a notice.
  - *Blocage*: a closure or maintenance with no person attached. Its label (e.g. "Entretien") is shown to everyone on the grid. Pick *Tous les ordinateurs* to block every computer at once; computers already booked at that time are skipped and listed.

  Admin bookings are confirmed right away (no confirmation emails), can run up to the whole day, and can be on any future date. The one-computer-at-a-time rule still applies to the person.
- **Change a booking:** click it in "Horaire" → **Modifier** (or **Modifier** in the admin tab). You can move it to another day, computer or time, or give it to someone else. If you tick the email box, the person gets a "booking changed" email; if you reassign it, the previous person gets a cancellation email.
- **Cancel a booking:** click the slot in "Horaire" (or use "Annuler" in the admin tab). The person is emailed. Changing Status to `Cancelled` in the Bookings tab also frees the slot, but sends no email.
- **Add a booking in the spreadsheet:** on a new row of the Bookings tab, fill in Computer (exact name from the Computers tab), Start, End (e.g. `2026-11-12 10:00`) and Email (leave Email blank and write a label in **Note** for a block). Leave Booking ID and Status blank. The script fills them in (Status = Confirmed) as soon as the row is complete, and the slot is taken immediately.
- **Settings page (no spreadsheet needed):** admins have a **Réglages (admin)** tab on the booking site. There they can:
  - turn each computer's **Réservable** switch on or off (saved instantly; existing bookings are kept, and the page says how many remain);
  - add, rename, reorder (↑ ↓) or delete computers. A rename carries all the computer's bookings over to the new name. Deleting is refused while the computer has upcoming bookings;
  - edit RAM, notes and **software** (e.g. "SPSS, Stata, R"). Software is shown under the computer's name on the schedule, and researchers can filter with "Avec SPSS", etc.;
  - set when the confirmation email and an optional second reminder go out, and when unconfirmed bookings are cancelled;
  - set the opening hours **day by day** (open or closed, opening and closing time for each day, e.g. Monday until 20:00), weeks shown, longest booking and upcoming bookings per person;
  - edit lab name, address, contact, reply-to and allowed sign-up domains;
  - add or remove admins.

  Every change is checked before saving (e.g. a reminder must come before the deadline) and is recorded in the **Log** tab (who, what, before, after), shown at the bottom of the page. Admins can't remove themselves or the owner account. Only slot length and the web app URL stay spreadsheet-only.
- **See the site as a researcher does:** sign in with a non-admin address in a private window.
- **Add an admin:** add their email to ADMIN_EMAILS (comma-separated).
- **Rules that apply to everyone, admins included:** one computer at a time (no overlapping bookings). Admins are exempt only from MAX_UPCOMING_BOOKINGS.
- **Spam:** sign-in emails often land in junk mail; the sign-in page tells people to check there.

---

A free booking system that runs on a Google Sheet and Google Apps Script. Nothing to host or pay for.

**What it does**
- Researchers sign in with any email address. They get a personal link by email, with no password and no Google account needed.
- They see a grid of time slots per computer, tap a free slot, and choose how long to book.
- 48 h before each booking, they get an email asking them to confirm. If they don't confirm by 8 h before the start, the booking is cancelled and the slot freed. They get an email saying so.
- Bookings made less than 48 h ahead are confirmed automatically (no email).
- Admins see who booked each slot, can cancel any booking (the person is emailed), and control everything from the spreadsheet.

Setup takes about 15 minutes on a computer, not a phone.

---

## 1. Create the spreadsheet and paste the code

1. Sign into **reservation.ciqss.uqam@gmail.com** (use a separate browser profile or a private window so your own account stays out of it). Go to <https://sheets.new> and name the sheet "CIQSS booking".
2. Open **Extensions → Apps Script**.
3. In the editor, select everything in `Code.gs`, delete it, and paste in the contents of **Code.gs**.
4. Click **+** next to "Files" → **HTML**, name it `Index` (exactly that; the editor adds `.html`), and paste in the contents of **Index_2.html** (named that way in this repo because `index.html` is the website's `/reservation/` redirect).
5. Open **Project Settings** (gear icon). Check that **Time zone** is *(GMT-05:00) Eastern Time – Toronto*.
6. Click **Save** (disk icon).

## 2. Run setup once

1. Back in the **Editor**, choose `setup` in the function dropdown at the top and click **Run**.
2. Google asks for permission. Click **Review permissions**, pick your account, then **Advanced → Go to (project name) (unsafe) → Allow**. The warning appears because the script is yours and not verified by Google. It asks to edit the spreadsheet, send email as you, and run on a schedule.
3. Go back to the spreadsheet. You now have four tabs: **Config, Computers, Bookings, Users**, and a **Lab booking** menu.

## 3. Deploy the web page

1. In the Apps Script editor: **Deploy → New deployment**. Click the gear next to "Select type" and choose **Web app**.
2. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
3. Click **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
4. Paste that URL into the spreadsheet: **Config → WEB_APP_URL → Value**.

## 4. Adjust the settings

The **Computers** tab lists the lab's machines as on the lab plan: Poste 1–9 and Poste Antoine (16 or 64 GB of RAM). Columns: **Computer**, **RAM (GB)**, **Available**, **Notes**, **Notes (English)**, **Software**. Admins can manage all of this from the settings page instead.

- **Available** unticked: the computer stays on the booking page, greyed out, and cannot be booked (Postes 5 and 8 for now).
- **Notes**: a computer with a note gets an asterisk (e.g. "Poste Antoine*"); the note is shown under the grid and in the booking dialog. Write it in French in **Notes** and in English in **Notes (English)** (blank = the French note is used).
- Researchers can filter the schedule to 64 GB or 16 GB machines.
- To (re)load the official list, use the menu **Lab booking → Load the CIQSS computer list**. It overwrites the Computers tab and renames bookings made under the old names (PC-01 → Poste 1, …, PC-10 → Poste Antoine).

**Calendar.** The "Horaire" tab shows the next **BOOKING_WEEKS** weeks (4 by default), one week below the other, starting with the current week (next week on weekends). Each day shows how many slots are still free and a blue dot on days where you have a booking; click a day to see its grid.

In the **Config** tab, change any value. Changes apply immediately.

| Setting | Default | Meaning |
|---|---|---|
| LAB_NAME | CIQSS – UQAM-INRS laboratory | Shown on the page and in emails |
| LAB_ADDRESS | 320, rue Sainte-Catherine Est, DS-5560 … | Shown on the page and in emails |
| LAB_CONTACT | acces@ciqss.org · 514 987-3000, poste 4969 | Shown on the page and in emails |
| REPLY_TO | (blank) | Where replies to booking emails go; blank = the lab Gmail |
| ADMIN_EMAILS | reservation.ciqss.uqam@gmail.com, munteanu.andrei@uqam.ca | Comma-separated admin list |
| ALLOWED_EMAIL_DOMAINS | (blank = anyone) | e.g. `uqam.ca, umontreal.ca` |
| SLOT_MINUTES | 60 | Slot length |
| WEEK_HOURS | (blank) | Hours per day, e.g. `Mon 09:00-20:00, Tue 09:00-17:00, …`; days not listed are closed. Set it on the settings page. When set, it overrides the two rows below |
| DAY_START / DAY_END | 09:00 / 17:00 | Opening hours when WEEK_HOURS is blank (the settings page keeps them at the earliest opening and latest closing; admin bookings on closed days use them) |
| OPEN_DAYS | Mon,Tue,Wed,Thu,Fri | Days the lab is open when WEEK_HOURS is blank |
| BOOKING_WEEKS | 4 | Weeks shown in the calendar (current week first); every open day in them can be booked. Replaces BOOKING_HORIZON_DAYS, which *Set up / repair* removes |
| MAX_SLOTS_PER_BOOKING | 8 | Longest single booking (8 = a full day) |
| MAX_UPCOMING_BOOKINGS | 5 | Per person; admins are exempt |
| CONFIRM_REMINDER_HOURS | 48 | When the confirm email goes out (hours before the start). Bookings made after that are confirmed automatically. A list such as `48, 24` adds a second reminder, sent only if still unconfirmed |
| CONFIRM_DEADLINE_HOURS | 8 | Unconfirmed bookings are cancelled this long before the start |

**Rules built in:** a researcher can use only one computer at a time (no overlapping bookings across computers). Other researchers see only "Booked" on taken slots; only admins see who booked.

## 5. Try it, then share it

1. Open the web app URL, enter your own email, and use the link you receive. You should see the grid and an "All bookings (admin)" tab.
2. Send the URL to researchers. Each person enters their email once and bookmarks the link they receive.

---

## Language

- The site is in **French by default**, with an **English / Français** button on the sign-in page and in the header. Each browser remembers the last choice.
- Emails (sign-in links, confirmation requests, cancellations) go out in the language each person last used on the site, French by default. It is stored in the **Language** column of the Users tab (`fr` or `en`); you can change it there.
- Dates and times use Quebec style in French ("mar. 5 nov., 9 h–11 h") and 24-hour time in English.
- The spreadsheet itself (tab names, Config descriptions) stays in English; only researchers see the site and the emails.

## Good to know

- **Email limit.** A free Gmail account can send about 100 emails a day through scripts; a Google Workspace account can send more. Each booking uses at most one or two emails (the confirm request, and a notice if it is auto-cancelled). Sign-in links count too.
- **Timing.** The reminder check runs every 15 minutes, so emails and cancellations can be up to 15 minutes later than the exact hour.
- **Lost or leaked link.** Delete that person's row in the **Users** tab. They then request a new link from the sign-in page; their old bookings stay.
- **Editing by hand.** You can edit the Bookings tab directly. To cancel a booking manually, set its Status to `Cancelled`. Don't change the Booking ID or the Email action key columns. New rows typed in with a blank Booking ID are completed automatically (see Admin tasks). The **Note** and **Created by** columns are added the first time the new code runs.
- **Renaming a computer:** do it from the settings page, which renames its bookings too. Renaming directly in the Computers tab detaches its existing bookings, which keep the old name.
- **Updating the code later.** After pasting new code, go to **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**. The URL stays the same.
- **Email links.** The "confirm" and "cancel" links in emails open a page with a button. Nothing changes until the button is pressed, so email security scanners that open links can't confirm or cancel bookings by accident.
- **Privacy.** Only admins see who booked a slot; other researchers see "Booked".
- **Menu.** *Lab booking → Set up / repair* re-creates missing tabs or settings without touching existing data. *Run reminder check now* runs the 15-minute check immediately.
