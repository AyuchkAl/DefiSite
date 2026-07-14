---------------------
Project description
---------------------
💡 This md file describes only one TAB= Assets_Performance,commented in app.js as  ==TA DATA GRAPH ===

*This project purpose is to store data from Google Sheet in Supabase Postgres using GitHub Pages Website:https://ayuchkal.github.io/DefiSite/ as a fronted*

---------------------
Setup
---------------------
1. GitHub Pages for the website.

2. Supabase Postgres for the database.

3. A small scheduled sync function that imports data from Google Sheets into Postgres.

4. Frontend fetches prepared data from Supabase API or your own backend endpoint.

-----------------------------
Practical Implementation Plan
-----------------------------
1. Keep your current Google Sheet as the source of truth.

2. Create database tables for raw imports and daily aggregated earnings.

3. Build a small sync script that reads Google Sheets API and upserts rows into the database.

4. Expose only read-only API endpoints for the website.

5. In GitHub Pages, use fetch() to load earnings JSON and render charts/cards/tables.

----------------------------------------
Supabase Configuration and Specification
----------------------------------------
- DB located at : https://supabase.com/dashboard/project/vphdvuvofpkogemvejff/editor/25391?schema=public
- DB consist of table(s):
[TA_DATA]
id (int8)
value(varchar)
created_at(timestamptz)
created_at_minsk(timestamp)

**DONE**

----------------------------------
Step-by-Step implementation Plan
----------------------------------
1. In web-project need to create button named <Load>. This button suppose to be under Total Assests panel.

**DONE**

2. When I press button Load data from Google sheet : https://docs.google.com/spreadsheets/d/1P5nCTz5MDnY2_A_Bq_ESRsPr-7IlWbNexEcZ7t-ySYM/edit?gid=0#gid=0  column = Y2 are loaded and saved to Supabase in table TA_DATA


3. Each time button <Load> pressed the following action happens for TA_DATA table:
 
 - Id inserted like increment starting from 1
 - value inserted from google sheet described in step 2 
 - created_at inserted as date-time of insert in format = YYYY-MM-DD-HH24:MI. Time suppose to be UTC+3
 
 **DONE**

4. Need to implement some task scheduler service that will be load data described in Step 2 automatically.
 Scheduler service need to be run in background and do exactly the sa,e as manually pressed button <Load>.
 Scheduler service need to be run every-day at 15:00 UTC+3(Minsk Time).

**DONE**

6. Need to create the following graph with the following attributes:

 -- Prototype picture: ![alt text](image.png)
 -- Graph location on site: ![alt text](image-1.png)
 -- Grapp description:
  ** Graph should have 2 axis: x-axis and y-axis
  ** X-axis: Date taken from supabase in format YYYY-MM-DD: [table= ta_data; column=created_at_minsk]
  ** Y-axis: Value taken from supabase; values should be negative(e.g -32.42) and potitive(e.g. 33.41); zero value shoul be in the middle of Y-axis : [table =ta_data; column=value]
  ** If graph goes to negative value it should be painted in red color; if graph goes to positive value it should be painted in green color.

**DONE**

----------------------------------
Modification Plan
----------------------------------

1. Y-axis currently has the following values= -40; -20; 0; 20; 40. Need to modify it to make it more precise: suggestion: -40; -35; -20; .... and so on. Also it should be a pointer like <-------> going from Y-axis value in parallel with X-axis. Ref ![Pointer](image-2.png)

2. Remove Reload button from TA DATA GRAPH