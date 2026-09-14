# The Multiply Labs badge

Every Multiply experiment carries the same badge: the pinwheel mark and the lowercase
wordmark in a black pill, linking to the hub at https://multiply.co/labs. It is
self-contained and sits on dark or light grounds.

In this repo it lives in `src/labs/badge.ts` and `src/labs/badge.css`; the header renders
`labsBadge()`. To put it in another experiment, copy those two files, or paste this:

```html
<a class="mlabs" href="https://multiply.co/labs" target="_blank" rel="noopener"
   title="A Multiply Labs experiment. More at multiply.co/labs" aria-label="Multiply Labs">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.1336 11.7762C21.1183 12.6152 20.4062 13.2719 19.5687 13.2193L15.9033 12.9891C14.8342 12.922 13.8689 12.3263 13.3294 11.4009C12.7899 10.4754 12.7472 9.34189 13.2155 8.37846L14.8212 5.07543C15.1881 4.32075 16.1104 4.02466 16.848 4.42479C17.6422 4.85562 17.8648 5.89338 17.3171 6.61201L15.5829 8.88763C15.3078 9.24861 15.2775 9.73984 15.5061 10.1319C15.7346 10.524 16.177 10.7397 16.6267 10.6781L19.4614 10.2903C20.3566 10.1678 21.15 10.8729 21.1336 11.7762ZM7.35303 4.65444C8.12839 4.19141 9.13408 4.50256 9.51249 5.32257L10.8317 8.18136C11.3214 9.24253 11.2512 10.4778 10.6445 11.4766C10.0799 12.4062 9.11649 13.0218 8.03569 13.1436L4.4753 13.5448C3.59226 13.6443 2.82449 12.9415 2.84573 12.0531C2.86583 11.2123 3.58783 10.5608 4.42632 10.6269L7.38255 10.8598C7.84084 10.8959 8.28058 10.6716 8.52035 10.2793C8.78197 9.85137 8.75526 9.30694 8.453 8.90664L6.9193 6.87537C6.37423 6.15348 6.57641 5.11822 7.35303 4.65444ZM7.59625 20.2022C6.81273 19.7829 6.57947 18.7686 7.10115 18.0492L9.20454 15.1486C9.84305 14.2682 10.8534 13.7331 11.9405 13.6998C13.1087 13.664 14.2182 14.2116 14.9003 15.1606L16.738 17.7171C17.2651 18.4505 17.0403 19.4789 16.2553 19.9255C15.4691 20.3728 14.4686 20.0386 14.109 19.2086L13.0971 16.8732C12.8977 16.4129 12.4371 16.1214 11.9358 16.1382C11.4763 16.1536 11.0644 16.4257 10.8701 16.8423L9.61618 19.5295C9.26054 20.2917 8.33785 20.599 7.59625 20.2022Z"/></svg>
  <b>multiply</b><span>labs</span>
</a>
```

```css
.mlabs { --mlabs-h: 30px; display: inline-flex; align-items: center; gap: 8px; height: var(--mlabs-h); padding: 0 12px 0 6px;
  border-radius: 999px; background: #0A0A0A; color: #fff; border: 1px solid rgba(255,255,255,0.14);
  font-family: 'Figtree', system-ui, -apple-system, sans-serif; font-size: 13px; line-height: 1; letter-spacing: -0.01em;
  text-decoration: none; white-space: nowrap; flex: none; transition: border-color 0.2s, transform 0.2s; }
.mlabs:hover { border-color: rgba(255,255,255,0.4); transform: translateY(-1px); }
.mlabs svg { width: 18px; height: 18px; fill: #fff; display: block; }
.mlabs b { font-weight: 600; }
.mlabs span { font-weight: 400; color: rgba(255,255,255,0.72); }
.mlabs.small { --mlabs-h: 26px; font-size: 12px; gap: 6px; padding: 0 10px 0 5px; }
.mlabs.small svg { width: 16px; height: 16px; }
```

Rules: the pill stays black and the mark stays white, whatever the experiment's palette.
Put it beside the experiment's own wordmark in the header. Add `small` where 30 px is too
tall. The footer and the about text should also say, in words, that it is a Multiply
experiment with more at multiply.co/labs.
