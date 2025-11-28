export default function HomePage() {
  return (
    <section>
      <h2>Καλώς ήρθες στο νέο Repertorio</h2>
      <p>
        Αυτό είναι το νέο frontend σε Next.js, που διαβάζει δεδομένα από το NestJS API
        στο <code>http://localhost:3000/api/v1</code>.
      </p>
      <p>
        Ξεκίνα από τη σελίδα <a href="/songs">Τραγούδια</a> για να δεις άμεσα
        δεδομένα από την PostgreSQL.
      </p>
    </section>
  );
}
