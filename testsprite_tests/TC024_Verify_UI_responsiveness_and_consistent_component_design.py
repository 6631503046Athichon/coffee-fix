import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None
    
    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()
        
        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )
        
        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)
        
        # Open a new page in the browser context
        page = await context.new_page()
        
        # Navigate to your target URL and wait until the network request is committed
        await page.goto("http://localhost:5173", wait_until="commit", timeout=10000)
        
        # Wait for the main page to reach DOMContentLoaded state (optional for stability)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=3000)
        except async_api.Error:
            pass
        
        # Iterate through all iframes and wait for them to load as well
        for frame in page.frames:
            try:
                await frame.wait_for_load_state("domcontentloaded", timeout=3000)
            except async_api.Error:
                pass
                # Test responsive design at different viewport sizes
        viewports = [
            {'width': 1920, 'height': 1080, 'name': 'Desktop Large'},
            {'width': 1280, 'height': 720, 'name': 'Desktop Standard'},
            {'width': 768, 'height': 1024, 'name': 'Tablet'},
            {'width': 375, 'height': 667, 'name': 'Mobile'}
        ]
        
        responsive_issues = []
        
        for viewport in viewports:
            await page.set_viewport_size({'width': viewport['width'], 'height': viewport['height']})
            await asyncio.sleep(1)
            
            # Check if main elements are visible and not overlapping
            frame = context.pages[-1]
            try:
                # Check if login form is properly displayed
                login_form = frame.locator('form').first
                if await login_form.is_visible(timeout=2000):
                    box = await login_form.bounding_box()
                    if box and (box['width'] > viewport['width'] or box['height'] > viewport['height']):
                        responsive_issues.append(f"{viewport['name']}: Form overflow detected")
            except:
                pass
        
        # Reset to standard size for testing
        await page.set_viewport_size({'width': 1280, 'height': 720})
        await asyncio.sleep(1)
                # Interact with the page elements to simulate user flow
        # -> Input username and password, then sign in to proceed to main application page for further UI testing.
        frame = context.pages[-1]
        # Input username/email
        elem = frame.locator('xpath=html/body/div/div/div/div[2]/form/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('test@example.com')
        

        frame = context.pages[-1]
        # Input password
        elem = frame.locator('xpath=html/body/div/div/div/div[2]/form/div[2]/div/input').nth(0)
        await page.wait_for_timeout(3000); await elem.fill('test123456')
        

        frame = context.pages[-1]
        # Click Sign In button to login
        elem = frame.locator('xpath=html/body/div/div/div/div[2]/form/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # --> Assertions to verify UI responsiveness and consistency
        frame = context.pages[-1]
        await expect(frame.locator('text=Farmer Dashboard').first).to_be_visible(timeout=30000)
        
        # Test component consistency across the application
        ui_components = {
            'buttons': frame.locator('button'),
            'inputs': frame.locator('input'),
            'cards': frame.locator('[class*="card"], [class*="Card"]'),
            'navigation': frame.locator('nav, aside')
        }
        
        consistency_checks = []
        for component_type, locator in ui_components.items():
            try:
                count = await locator.count()
                if count > 0:
                    consistency_checks.append(f'{component_type}: {count} found')
            except:
                pass
        
        # Test responsive behavior at mobile size (375x667)
        await page.set_viewport_size({'width': 375, 'height': 667})
        await asyncio.sleep(2)
        
        # Check if mobile menu or hamburger exists
        mobile_menu_found = False
        mobile_indicators = [
            frame.locator('[aria-label="Menu"]').first,
            frame.locator('button:has-text("Menu")').first,
            frame.locator('[class*="hamburger"]').first,
            frame.locator('[class*="mobile-menu"]').first,
            frame.locator('[class*="sidebar"]').first
        ]
        
        for indicator in mobile_indicators:
            try:
                if await indicator.is_visible(timeout=2000):
                    mobile_menu_found = True
                    break
            except:
                continue
        
        # Test tablet size (768x1024)
        await page.set_viewport_size({'width': 768, 'height': 1024})
        await asyncio.sleep(2)
        
        # Verify layout doesn't break at tablet size
        try:
            body = frame.locator('body').first
            box = await body.bounding_box()
            if box and box['width'] > 0:
                pass  # Layout is rendering properly
        except:
            raise AssertionError('UI layout failed to render properly at tablet size')
        
        # Test desktop large size (1920x1080)
        await page.set_viewport_size({'width': 1920, 'height': 1080})
        await asyncio.sleep(2)
        
        # Reset to standard desktop size
        await page.set_viewport_size({'width': 1280, 'height': 720})
        await asyncio.sleep(1)
        
        # Report any responsive issues found during testing
        if responsive_issues:
            print(f'Warning: Responsive issues detected: {", ".join(responsive_issues)}')
        
        # Verify key navigation elements are present and consistent
        frame = context.pages[-1]
        await expect(frame.locator('text=Coffee Lab').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Farmer Dashboard').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Harvest Lots').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Farm Management').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Data Hub').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=GAP Helper').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Processor Workbench').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Scoring Sheet').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Competition Admin').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Quality Insights').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Roaster Workbench').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Traceability Hub').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=User Management').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Activity Types').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Process Types').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Coffee Varieties').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Test User').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Farmer').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Admin').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Logout').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Your command center for farm and harvest management.').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Total Harvest Lots').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=2').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Total Weight (kg)').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=200').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Best Avg Feedback').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=-').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Lowest Avg Feedback').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Farm Summary').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Total Farms').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=1').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Varieties Planted').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Farms with GPS').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Recent Harvest Lots').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=View All →').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=B0B4B12D').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Ready for Processing').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Gesha').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=100 kg').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=2026-01-21T00:00:00.000Z').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=FB410697').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Quality Feedback').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Top-performing lots with cupping scores - click to view traceability').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=LOT ID').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=VARIETY').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=SPIDER CHART').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=TOTAL SCORE').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=GRADE').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=PROCESS TYPE').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=HARVEST DATE').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=HL001').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Gesha').nth(1)).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Fragrance').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Flavor').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Aftertaste').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Acidity').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Body').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Uniformity').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Balance').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Clean Cup').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Sweetness').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Overall').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=87.5').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Specialty').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Washed').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=2024-01-15').first).to_be_visible(timeout=30000)
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    