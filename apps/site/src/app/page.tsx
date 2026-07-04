import Link from "next/link";

export default function Home() {
  return (
    <main className="home">
      <h1>Paris Viz</h1>
      <p className="home-sub">
        Visualisations interactives des données ouvertes de Paris et
        d&apos;Île-de-France.
      </p>
      <div className="cards">
        <Link className="card" href="/flux">
          <h2>Flux — le réseau ferré en mouvement</h2>
          <p>
            Les 21 000 trajets quotidiens du métro, du RER et du tramway se
            déplacent sur la carte au fil d&apos;une journée, d&apos;après les
            horaires réels.
          </p>
        </Link>
        <a className="card" href="https://github.com/lematty/noctilien">
          <h2>Noctilien — bus de nuit</h2>
          <p>
            Carte de chaleur de la fréquence des bus de nuit : quels quartiers
            sont desservis après minuit, et lesquels ne le sont pas.
          </p>
        </a>
      </div>
    </main>
  );
}
