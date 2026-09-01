#!/usr/bin/env node
/**
 * Capture screenshots of surface labels for verification
 * Run: node scripts/capture-surface-labels.mjs
 */

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const OUTPUT_DIR = 'ref/final-surface-labels'
const DEV_URL = 'http://localhost:5175'

async function captureScreenshots() {
  console.log('Starting browser...')
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1728, height: 900 },
    deviceScaleFactor: 1,
  })
  
  const page = await context.newPage()
  
  try {
    console.log(`Navigating to ${DEV_URL}...`)
    await page.goto(DEV_URL, { waitUntil: 'networkidle' })
    
    // Wait for controller to load
    console.log('Waiting for controller to load...')
    await page.waitForTimeout(3000)
    
    // Ensure output directory exists
    await mkdir(OUTPUT_DIR, { recursive: true })
    
    // Capture full controller view
    console.log('Capturing full-controller.png...')
    await page.screenshot({ 
      path: join(OUTPUT_DIR, 'full-controller.png'),
      fullPage: false,
    })
    
    // Capture pad closeup (left deck)
    console.log('Capturing pads-closeup.png...')
    await page.evaluate(() => {
      // Zoom camera closer to pads
      window.__DEBUG_CAMERA_DISTANCE__ = 0.35
    })
    await page.waitForTimeout(500)
    await page.screenshot({ 
      path: join(OUTPUT_DIR, 'pads-closeup.png'),
      fullPage: false,
    })
    
    // Capture mixer closeup
    console.log('Capturing mixer-closeup.png...')
    await page.evaluate(() => {
      window.__DEBUG_CAMERA_DISTANCE__ = 0.30
    })
    await page.waitForTimeout(500)
    await page.screenshot({ 
      path: join(OUTPUT_DIR, 'mixer-closeup.png'),
      fullPage: false,
    })
    
    // Capture FX closeup
    console.log('Capturing fx-closeup.png...')
    await page.screenshot({ 
      path: join(OUTPUT_DIR, 'fx-closeup.png'),
      fullPage: false,
    })
    
    // Reset camera
    await page.evaluate(() => {
      delete window.__DEBUG_CAMERA_DISTANCE__
    })
    await page.waitForTimeout(500)
    
    // Capture deck transport closeup
    console.log('Capturing deck-closeup.png...')
    await page.evaluate(() => {
      window.__DEBUG_CAMERA_DISTANCE__ = 0.35
    })
    await page.waitForTimeout(500)
    await page.screenshot({ 
      path: join(OUTPUT_DIR, 'deck-closeup.png'),
      fullPage: false,
    })
    
    console.log(`\nScreenshots saved to ${OUTPUT_DIR}/`)
    console.log('\nReview these images to verify:')
    console.log('- HOT CUE, PAD FX1, BEAT JUMP, SAMPLER are readable')
    console.log('- PLAY, CUE, TEMPO, SYNC are readable')
    console.log('- TRIM, HI, MID, LOW, CFX are readable')
    console.log('- CH 1, CH 2 are readable')
    console.log('- BEAT FX, FX SELECT, LEVEL/DEPTH, ON/OFF are readable')
    console.log('- BROWSE, LOAD are readable')
    console.log('\nPress Enter to close browser...')
    
  } catch (error) {
    console.error('Error during screenshot capture:', error)
  }
  
  // Keep browser open for manual inspection
  console.log('\nBrowser will remain open for manual inspection.')
  console.log('Close the browser window when done.')
  await page.waitForTimeout(300000) // Keep alive for 5 minutes
  
  await browser.close()
}

captureScreenshots().catch(console.error)
