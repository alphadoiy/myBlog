import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const markdownContent = `# YangWX

武汉程序员萌新，热爱编程与开源，记录成长点滴。

## Navigation

- [About](/about.md)
- [Recent Posts](/posts.md)
- [Archives](/archives.md)
- [RSS Feed](/rss.xml)

## Links

- X: [@3kxdUtEa4ZNfe5B](https://x.com/3kxdUtEa4ZNfe5B)
- GitHub: [@alphadoiy](https://github.com/alphadoiy)
- Email: wyang5144@gmail.com

---

*This is the markdown-only version of yangwx.xyz. Visit [yangwx.xyz](https://yangwx.xyz) for the full experience.*`;

  return new Response(markdownContent, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
