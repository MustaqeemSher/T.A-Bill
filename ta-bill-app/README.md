# T.A. Bill – Sayyed Engineers Limited

Mobile-friendly web app. Employees sign in with their **email only** (no password, no verification code),
create T.A. Bills, see their own past bills, and download/print a **real vector PDF** laid out exactly like
the paper T.A. Bill form. Rows grow automatically for long text, and extra pages are added when needed.

Files:
- `index.html`: the whole app (works on phones)
- `pdf.js`: draws the PDF form
- `schema.sql`: database table and security rules

Data is stored long-term in a **Supabase** database (free plan is enough to start). Each email only sees its own bills.

## 1. Create the database (about 5 minutes, free)

1. Go to https://supabase.com, sign up, click **New project**. Pick any name and password, and a region near you.
2. Open **SQL Editor, New query**, paste the whole contents of `schema.sql`, click **Run**.
3. Open **Project Settings, API**. Copy the **Project URL** and the **anon public key**.
4. Open `index.html` in a text editor and paste them near the top:
   ```js
   const SUPABASE_URL = 'https://xxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ...';
   ```
   (The anon key is meant to be public. The security rules in `schema.sql` protect the data.)

## 2. Put it online (free)

Upload the folder (`index.html`, `pdf.js`) to any static host, for example:
- **Netlify**: drag and drop the folder at https://app.netlify.com/drop
- **Vercel**, **Cloudflare Pages**, or **GitHub Pages**

Share the link with employees. On a phone they can use “Add to Home Screen”.

## Using the app

1. Enter your email and tap Continue. The same email always shows the same bills, and the browser remembers it until Sign out.
2. **Create new T.A. Bill**: fill Name, Designation, Purpose, then add entries (date, time,
   Departure/Arrival, particulars, amount). Advance and D.A (days × rate) are optional.
3. **Save** keeps it in the database. **Print / PDF** saves and downloads the PDF, which can be printed on A4.

## Notes

- **Security:** there is no verification, so anyone who types another person's email can open that person's
  bills. This is the choice for simple, fast access. The database blocks bulk access (every request needs an
  exact email), but if bills are sensitive, add a password or email code later.

- The PDF uses English text. Urdu text will not display in the PDF without adding a font.
- Total = all entry amounts + (D.A days × rate). The Advance is printed on the form as in your paper bill.
- Demo mode: while the two Supabase values are empty, the app works but saves only in that browser.
- The PDF libraries load from the internet (CDN), so the page needs an internet connection.
