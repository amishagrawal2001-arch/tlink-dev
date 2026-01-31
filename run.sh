#TLINK_DEV=1 ./node_modules/.bin/electron app -d --inspect

## debug mode ##
TLINK_CONFIG_DIRECTORY=/tmp/tlink-clean \
TLINK_PLUGINS= \
ELECTRON_ENABLE_LOGGING=1 \
ELECTRON_ENABLE_STACK_DUMPING=1 \
yarn start


