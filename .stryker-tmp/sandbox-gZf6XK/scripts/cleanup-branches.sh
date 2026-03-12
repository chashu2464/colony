#!/bin/bash
# scripts/cleanup-branches.sh - Cleans up task branches

main_branch=$(git rev-parse --verify main >/dev/null 2>&1 && echo "main" || echo "master")

echo "Cleaning up branches starting with 'feature/task-' that are no longer needed..."

# List branches starting with feature/task-
branches=$(git branch | grep 'feature/task-' | sed 's/^[ *]*//')

for branch in $branches; do
    # Check if the branch has been squashed into main/master
    # We look for the branch name in the commit messages of the main branch
    if git log $main_branch --grep="complete task .* - " -F --oneline | grep -q "${branch#feature/task-}"; then
        echo "Deleting merged branch: $branch"
        git branch -D "$branch"
    else
        echo "Skipping active branch: $branch"
    fi
done
