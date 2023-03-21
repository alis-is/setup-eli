  
#!/bin/sh

if [ -z "$1" ]; then
  echo "Must supply eli version argument"
  exit 1
fi

eli_version="$(eli -v)"
echo "Found eli version '$eli_version'"
if [ -z "$(echo $eli_version | grep $1)" ]; then
  echo "Unexpected version"
  exit 1
fi