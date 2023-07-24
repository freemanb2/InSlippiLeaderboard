FILE=cron/data/players-old.json
if ! test -f "$FILE"; then
    echo '[]' > cron/data/players-old.json
    echo '{ "updated": 0 }' > cron/data/timestamp.json
fi