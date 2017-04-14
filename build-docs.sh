#!/bin/bash
set -ex

# Pull requests and commits to other branches shouldn't try to deploy, just build to verify
if [ "$TRAVIS_PULL_REQUEST" != "false" -o "$TRAVIS_BRANCH" != master ]; then
    echo "Skipping doc build.";
    exit 0
fi

# Save some useful information
REPO=`git config remote.origin.url`
SSH_REPO=${REPO/https:\/\/github.com\//git@github.com:}

git checkout master

rm -rf other
mkdir other
cd other
git clone ${REPO%.git}-browse.git
git clone ${REPO%.git}-image.git
git clone ${REPO%.git}-settings.git
git clone ${REPO%.git}-source-control.git
git clone ${REPO%.git}-status.git
git clone ${REPO%.git}-transport.git
git clone ${REPO%.git}-volume-control.git

cd ..

# Now let's go have some fun with the cloned repo
git config user.name "Travis CI"
git config user.email "$COMMIT_AUTHOR_EMAIL"

npm install -g jsdoc

mkdir -p docs
jsdoc *.js other/*/*.js -d docs
git add docs

git commit -m "Deploy to GitHub Pages"

# Get the deploy key by using Travis's stored variables to decrypt deploy_key.enc
ENCRYPTED_KEY_VAR="encrypted_${ENCRYPTION_LABEL}_key"
ENCRYPTED_IV_VAR="encrypted_${ENCRYPTION_LABEL}_iv"
ENCRYPTED_KEY=${!ENCRYPTED_KEY_VAR}
ENCRYPTED_IV=${!ENCRYPTED_IV_VAR}
openssl aes-256-cbc -K $ENCRYPTED_KEY -iv $ENCRYPTED_IV -in deploy_key.enc -out deploy_key -d
chmod 600 deploy_key
eval `ssh-agent -s`
ssh-add deploy_key

git subtree push --prefix docs $SSH_REPO gh-pages
