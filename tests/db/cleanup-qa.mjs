// Removes every leftover QA / TEST record (shops, vans, routes, the test item) from the live database.
// Run: node tests/db/cleanup-qa.mjs   (tests also do this by themselves when they finish; a nightly job is the backstop)
import { cleanupQA } from './lib.mjs'

await cleanupQA()
