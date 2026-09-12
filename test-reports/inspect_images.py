from PIL import Image

im4 = Image.open(r"C:\Users\19096\.gemini\antigravity\brain\e03dea31-f4e0-4067-9ffb-b5b070469cf4\.user_uploaded\media_1788935343930.png").convert('RGB')
w, h = im4.size

# Find the menu box (it starts around x=40, y=20)
# Look at the row of "归档" (around y=150-190)
for y in range(0, h, 10):
    for x in range(0, w, 10):
        c = im4.GetPixel if hasattr(im4, 'GetPixel') else im4.getpixel((x,y))
        # look for red line or hover bg

print("Scanning y from 140 to 200 around text '归档':")
for y in range(140, 190, 5):
    # sample x across the row
    row_str = f"y={y}: "
    for x in [35, 45, 50, 70, 80, 100, 120, 150, 200]:
        if x < w:
            c = im4.getpixel((x,y))
            row_str += f"x{x}=({c[0]},{c[1]},{c[2]}) "
    print(row_str)

im3 = Image.open(r"C:\Users\19096\.gemini\antigravity\brain\e03dea31-f4e0-4067-9ffb-b5b070469cf4\.user_uploaded\media_1788935337626.png").convert('RGB')
w3, h3 = im3.size
print("\nImage 3 (Top Menu) info:")
print("Scanning menu box in image 3:")
for y in range(60, 180, 20):
    row_str = f"y={y}: "
    for x in [5, 10, 20, 50, 100, 200, 300, 350, 370]:
        if x < w3:
            c = im3.getpixel((x,y))
            row_str += f"x{x}=({c[0]},{c[1]},{c[2]}) "
    print(row_str)
