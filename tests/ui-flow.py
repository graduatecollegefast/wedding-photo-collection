# Browser walkthrough against tests/mock-server.mjs (Playwright, Python).
#   npm run build && node tests/mock-server.mjs &   then   python3 tests/ui-flow.py
# Screenshots go to tests/screenshots/.
import json, os, struct, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4599"
OUT = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(OUT, exist_ok=True)

def jpg(name):
    return {"name": name, "mimeType": "image/jpeg", "buffer": b"\xff\xd8\xff\xe0" + b"\x00" * 2000}

def mov(name):
    return {"name": name, "mimeType": "video/quicktime", "buffer": struct.pack(">I", 20) + b"ftypqt  " + b"\x00" * 4000}

def stats():
    return json.loads(urllib.request.urlopen(BASE + "/__stats").read())

failures = []
def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

with sync_playwright() as p:
    browser = p.chromium.launch()

    for label, vp in [("iphone", {"width": 390, "height": 844}), ("android", {"width": 412, "height": 915})]:
        page = browser.new_page(viewport=vp, device_scale_factor=2, is_mobile=True, has_touch=True)
        page.goto(BASE + "/event/jordan-and-taylor")
        page.wait_for_selector("text=Add your photos & videos")
        page.screenshot(path=f"{OUT}/{label}-1-landing.png")
        page.close()

    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page.goto(BASE + "/event/jordan-and-taylor")
    page.wait_for_selector("text=Add your photos & videos")

    files = [jpg(f"IMG_20{i:02d}.JPG") for i in range(22)] + [jpg("IMG_FAIL_9999.JPG"), mov("IMG_3001.MOV"), jpg("IMG_REGFAIL.JPG"),
             {"name": "notes.jpg", "mimeType": "image/jpeg", "buffer": b"%PDF-1.7" + b"\x00" * 100}]
    page.set_input_files("input[type=file]", files)
    page.wait_for_selector("text=25 memories selected")
    check(page.locator("text=1 file can't be added").count() == 1, "renamed non-image rejected at selection")
    page.fill("input[autocomplete=name]", "Tanya Brooks")
    page.screenshot(path=f"{OUT}/iphone-2-review.png", full_page=True)

    page.click("text=Upload 25 memories")
    page.wait_for_selector("text=/Uploading \\d+ of 25/")
    page.wait_for_timeout(900)
    page.screenshot(path=f"{OUT}/iphone-3-progress.png", full_page=True)

    page.wait_for_selector("text=couldn't be uploaded", timeout=60000)
    page.screenshot(path=f"{OUT}/iphone-4-partial.png", full_page=True)
    s = stats()
    check(page.locator("text=23 memories uploaded.").count() == 1, "partial summary shows 23 uploaded")
    check(all(v == 1 for k, v in s["cloudinary"].items() if "FAIL" not in k), "each successful file sent to Cloudinary once")
    check(s["cloudinary"].get("IMG_REGFAIL.JPG") == 1, "file whose album save failed was uploaded once")

    page.click("text=Try 2 failed files again")
    page.wait_for_selector("text=Memories added!", timeout=60000)
    page.screenshot(path=f"{OUT}/iphone-5-success.png", full_page=True)
    s = stats()
    check(page.locator("text=Thanks, Tanya!").count() == 1, "thanks with first name")
    check(page.locator("text=Your 25 photos and videos have been added").count() == 1, "success count 25")
    check(s["cloudinary"].get("IMG_REGFAIL.JPG") == 1, "retrying a failed album save did not re-upload the file")
    check(s["cloudinary"].get("IMG_FAIL_9999.JPG") == 4, "failed file re-uploaded only on retry")
    check(all(v == 1 for k, v in s["cloudinary"].items() if "FAIL" not in k), "successful files never re-uploaded after retry")
    check(len(s["registered"]) == 25, "exactly 25 album records")

    page.click("text=Upload more")
    page.wait_for_selector("text=Add your photos & videos")

    for slug, text in [("closed-wedding", "Uploads for this wedding are now closed."), ("expired-wedding", "This wedding gallery has expired."),
                       ("draft-wedding", "isn’t open for photos yet"), ("no-such-wedding", "Wedding not found")]:
        page.goto(f"{BASE}/event/{slug}")
        page.wait_for_selector(f"text={text}")
        check(True, f"{slug} shows correct message")
    page.goto(f"{BASE}/event/closed-wedding")
    page.wait_for_selector("text=now closed")
    page.screenshot(path=f"{OUT}/iphone-6-closed.png")
    page.close()

    # Dashboard (desktop)
    d = browser.new_page(viewport={"width": 1280, "height": 900})
    d.goto(BASE + "/dashboard")
    d.wait_for_selector("text=Your wedding album")
    d.fill("input[type=password]", "wrong password")
    d.click("button[type=submit]")
    d.wait_for_selector("text=That password is not right")
    check(True, "wrong dashboard password rejected")
    d.screenshot(path=f"{OUT}/desktop-1-login.png")
    d.fill("input[type=password]", "correct horse battery")
    d.click("button[type=submit]")
    d.wait_for_selector("text=Media collected")
    d.wait_for_selector(".tile img")
    d.wait_for_timeout(500)
    d.screenshot(path=f"{OUT}/desktop-2-dashboard.png")
    check(d.locator(".tile").count() == 50, "first page loads 50 items")
    d.mouse.wheel(0, 20000)
    d.wait_for_timeout(1200)
    check(d.locator(".tile").count() == 64, "infinite scroll loads the rest")

    d.locator(".tile-btn").nth(2).click()
    d.wait_for_selector(".viewer")
    d.keyboard.press("ArrowRight")
    d.wait_for_timeout(200)
    d.screenshot(path=f"{OUT}/desktop-3-viewer.png")
    d.click("text=Hide")
    d.wait_for_timeout(500)
    d.keyboard.press("Escape")
    check(d.locator(".tile").count() == 63, "hidden item removed from gallery")
    d.click("role=tab[name='Hidden']")
    d.wait_for_selector(".tile")
    check(d.locator(".tile").count() == 1, "hidden filter shows it")

    d.click("text=Download all")
    d.click("text=Prepare download")
    d.wait_for_selector("text=Photos — part 1 of 2")
    d.screenshot(path=f"{OUT}/desktop-4-download.png")
    d.click("text=Event settings")
    d.wait_for_timeout(600)
    d.screenshot(path=f"{OUT}/desktop-5-settings.png")
    check(d.locator("text=Download QR code").is_enabled(), "QR code generated")

    d.click("text=Sign out")
    d.wait_for_selector("text=Your wedding album")
    check(True, "logout returns to login")

    m = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    m.goto(BASE + "/dashboard")
    m.fill("input[type=password]", "correct horse battery")
    m.click("button[type=submit]")
    m.wait_for_selector(".tile img")
    m.wait_for_timeout(500)
    m.screenshot(path=f"{OUT}/iphone-7-dashboard.png")
    browser.close()

print(f"\n{len(failures)} failures")
sys.exit(1 if failures else 0)
