# Heart Studio · מיפוי לב

סטודיו מיפוי וידאו למקרן עבור אלמנט הלב בגודל 240×240 ס״מ, עם 21 טבעות שמתכנסות ללב קטן במרכז, ושני חצאים עם תפר באמצע.
האור מסונכרן למוזיקה, לווידאו ול-MIDI.

## איך פותחים

- **באינטרנט:** https://atzmoni.github.io/heart-studio/ (ב-Chrome או Edge, בגלל MIDI)
- **בלי אינטרנט (אירועים), הדרך המומלצת:** מורידים את הריפו (Code ← Download ZIP), פותחים את התיקייה ולוחצים פעמיים על:
  - **Windows:** `Start Heart Studio.bat`
  - **macOS:** `Start Heart Studio.command` (בפעם הראשונה: קליק ימני ← Open, כי הקובץ לא חתום)

  נפתח חלון שחור קטן (השרת) וחלון של הסטודיו ב-Chrome או Edge. משאירים את החלון השחור פתוח במהלך המופע וסוגרים אותו בסוף.
  הכתובת תמיד http://127.0.0.1:8765, ולכן הדפדפן זוכר את אישור המיקרופון ואת הכיול בין אירועים.
  לא צריך להתקין כלום: ב-Windows זה PowerShell, וב-macOS זה Perl, ושניהם מגיעים עם המחשב. הגופנים שמורים בתיקייה `fonts`.
- **קובץ יחיד:** [`heart-studio.html`](heart-studio.html), לחיצה כפולה וזהו. גם הוא עובד בלי אינטרנט ועם מיקרופון,
  אבל הדפדפן עלול לשאול על המיקרופון בכל פתיחה.

## מה יש בפנים

- **מבנה הלב** (`heart-geo.js`): קו מתאר שנמדד מתמונות האלמנט, טבעות שהן עותקים מוקטנים של הקונטור, ותפר מרכזי.
  כל טבעת מחולקת לחצי שמאל (a) וחצי ימין (b). יש ייצוא לשרטוט SVG ול-JSON, ביחידות של ס״מ.
- **מקרן** (`heart-gl.js`): כל פיקסל של המקרן מחושב בחזרה לס״מ על הלב, עם עיוות פרספקטיבה נפרד לכל חצי (6 נקודות כיול).
  אין זליגת אור מחוץ לקונטור.
- **52 אפקטים:**
  - **22 בסיס:** כיול, פעימת לב, רצים בתעלות, אקולייזר, מילוי נוזלי, אדוות, מנהרה ועוד.
  - **20 לייב:** מגיבים לביט, לקיק ולספקטרום.
  - **10 תלת-ממד:** מוארים לפי החיתוך עצמו. כל תעלה מצוירת כחתך V, והלב ככיפה.
- **ערוצים:** כל תעלה וכל לב שבין התעלות, בכל חצי, הוא ערוץ נפרד. לכל ערוץ אפקט, צבע ועוצמה משלו, ויש מצב זיהוי.
- **מנוע הטבעות** (`heart-engine.js`): מהלב הפנימי החוצה: לב, תעלה, לב, תעלה… יש 43 טבעות בכל חצי, וכל טבעת היא ערוץ מוזיקלי:
  - ספקטרום
  - תווים (חצי טון לכל טבעת)
  - אקורדים
  - MIDI
- **מוזיקה** (`heart-audio.js`):
  - **ניתוח מראש של שיר:** טמפו, גריד פעימות, תיבות, דרופים.
  - **כניסה חיה בכבל:** כרטיס קול עם ערוץ לכל חצי.
  - **MIDI:** תווים, CC, MIDI Learn, MIDI Clock.

## עבודה על הקוד

הקבצים סטטיים, אין שלב בנייה לאתר עצמו. כדי להריץ מקומית:

```
python3 -m http.server 8765
```

ואז פותחים http://localhost:8765/

אחרי כל שינוי בקוד בונים מחדש את הקובץ שעובד בלי אינטרנט:

```
python3 tools/build-heart-studio.py
```

---

Projection mapping studio for a 240 × 240 cm ring heart, driven by music, video and MIDI. Open `index.html` from any static
host. Offline at events, double-click `Start Heart Studio.bat` (Windows) or `Start Heart Studio.command` (macOS): it serves
the folder on http://127.0.0.1:8765 with what the OS already has and opens Chrome or Edge, so the microphone permission and
calibration persist. `heart-studio.html` also runs straight from disk. Static files, no build step; `tools/build-heart-studio.py`
regenerates the single-file offline build.
