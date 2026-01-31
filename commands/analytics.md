---
name: analytics
description: View your seller analytics — sales, reviews, downloads
---

# Seller Analytics

View sales and performance data for your published books.

## Action

1. Check authentication with `auth({ action: "status" })`. If not connected, prompt login.
2. Call `seller_analytics()` to fetch data.
3. Display: total revenue, per-book breakdown, recent reviews, hit counts.
