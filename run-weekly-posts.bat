@echo off
cd /d "C:\Users\emili\Documents\mealzy"
powershell -Command "$prompt = (Get-Content -Path '.claude\commands\post-this-week-free.md' -Raw); claude -p $prompt"
