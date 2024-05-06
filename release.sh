#!/bin/bash

set -e

function check_clean_git {
    BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    # check if branch is different than main and doesn't start by "release/"

    if [[ "$BRANCH" != "main" ]]; then
        echo "Error: your branch is '$BRANCH'. It must be 'main'"
        #exit 1;
    else
        echo "-- Branch is ok"
    fi

    if [ -z "$(git status --porcelain)" ]; then
        # Working directory clean
        echo "-- Working copy is ok"
    else
        # Uncommitted changes
        echo "Error: can't deploy local changes. Commit them before."
        exit 1
    fi
}

VERSION="$1"

if [ -z "$VERSION" ]; then
    echo "Usage:"
    echo "   ./release.sh <version>"
    exit 1
fi

check_clean_git

npm run format
npm run lint
npm run build
#npm publish

# tags
git tag -f "${VERSION}"
git push origin "${VERSION}" --force

exit 0