// app/components/Footer.tsx
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <span className="footer-text">
          © {year} Repertorio.net — All rights reserved.
        </span>

        <span className="footer-follow">
          <span className="footer-follow-label">Follow us:</span>

          <a
            href="https://www.facebook.com/repertorio.net"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-facebook"
            aria-label="Repertorio.net στο Facebook"
          >
            <span className="footer-facebook-f">f</span>
          </a>
        </span>
      </div>
    </footer>
  );
}
