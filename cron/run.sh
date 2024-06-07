#!/bin/bash -l
DIR_PATH=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$DIR_PATH/.."
node --experimental-modules --loader ts-node/esm --no-warnings --expose-gc cron/fetchStats.ts