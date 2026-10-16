# Uni Websites

مواقع الجامعة، كل موقع في مجلد خاص فيه.

| المجلد | الموقع |
|---|---|
| `islamic-economics-cards/` | https://islamic-economics-cards.vercel.app |
| `university-review-preview/` | https://university-review-preview.vercel.app |

## إضافة موقع جديد
1. سوّ مجلد جديد باسم الموقع وحط فيه ملفاته (لازم يكون فيه `index.html`).
2. في Vercel: **Add New → Project** ← اختر هذا الريبو ← في **Root Directory** اختر مجلد الموقع.

## Vercel Analytics
كل `index.html` فيه هذا قبل `</head>`:

```html
<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>
```
