#!/bin/bash
for i in {0..40}
do
    echo "Executing etiquetas chunk $i..."
    npx wrangler d1 execute cgr-dictamenes --remote --file=/tmp/et_fix_chunk_$i.sql --yes
done
echo "All etiquetas chunks executed."
