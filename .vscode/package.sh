#!/bin/bash

# Copy LICENSE file to local directory
cp ../../LICENSE .

# Temporarily replace extension README with root README to avoid duplication in source tree.
ORIGINAL_README=README.md
BACKUP_README=.README.original.backup
if [ -f "$ORIGINAL_README" ]; then
    mv "$ORIGINAL_README" "$BACKUP_README"
fi
cp ../../README.md "$ORIGINAL_README"

# Ensure restoration even if script exits early
restore_readme() {
    rm -f LICENSE
    if [ -f "$BACKUP_README" ]; then
        rm -f "$ORIGINAL_README"
        mv "$BACKUP_README" "$ORIGINAL_README"
    fi
}
trap restore_readme EXIT

# Check if output path is provided
if [ -z "$1" ]
  then
    echo "Output path not provided"
    vsce package
else
    # Create output directory if it doesn't exist
    if [ ! -d "$1" ]
    then
        echo "Creating output directory: $1"
        mkdir -p "$1"
    fi

    # Print output path
    echo "Packaging extension to $1"

    # Package the extension
    vsce package -o "$1"
fi

# Cleanup handled by trap (restores README and removes LICENSE)