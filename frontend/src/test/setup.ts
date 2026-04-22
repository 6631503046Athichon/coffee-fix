import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Runs a cleanup after each test case
afterEach(() => {
  cleanup()
})
