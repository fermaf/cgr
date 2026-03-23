#!/bin/bash
for i in {0..21}
do
    echo "Executing chunk $i..."
    # yes | npx wrangler d1 execute cgr-dictamenes --remote --file=/tmp/migration_chunk_$i.sql
    npx wrangler d1 execute cgr-dictamenes --remote --file=/tmp/migration_chunk_$i.sql --yes
done
echo "All chunks executed."
