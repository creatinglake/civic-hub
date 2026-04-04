import { Link } from "react-router-dom";

export default function About() {
  return (
    <div className="page about-page">
      <Link to="/" className="back-link">&larr; Home</Link>

      <h1>About the Floyd County Civic Hub</h1>

      <section className="about-section">
        <h2>What is the Floyd County Civic Hub?</h2>
        <p>
          The Floyd County Civic Hub is a pilot project aimed at improving how
          our community understands and expresses public sentiment on local issues.
        </p>
        <p>
          Between elections, there is often no clear way to understand what
          residents actually think about specific topics. This platform is
          designed to provide a simple, structured way to make that visible.
        </p>
      </section>

      <section className="about-section">
        <h2>What does this platform do?</h2>
        <p>The Civic Hub provides a process for:</p>
        <ul>
          <li>Proposing issues</li>
          <li>Gathering initial support</li>
          <li>Holding time-bound votes</li>
          <li>Sharing results publicly</li>
        </ul>
        <p>
          Each issue includes clear context and tradeoffs to support informed
          participation.
        </p>
      </section>

      <section className="about-section">
        <h2>What this platform is NOT</h2>
        <p>This platform is not:</p>
        <ul>
          <li>A political campaign or advocacy effort</li>
          <li>A discussion forum or social network</li>
          <li>A replacement for official elections or governance</li>
        </ul>
        <p>It does not make decisions or set policy.</p>
      </section>

      <section className="about-section">
        <h2>How are results used?</h2>
        <p>Results from votes are:</p>
        <ul>
          <li>Publicly visible</li>
          <li>Shared with relevant local officials</li>
          <li>Intended as an advisory signal only</li>
        </ul>
      </section>

      <section className="about-section">
        <h2>Neutrality and nonpartisanship</h2>
        <p>This platform is strictly nonpartisan.</p>
        <p>
          Issues are presented with an effort toward neutral framing, including:
        </p>
        <ul>
          <li>A clear question</li>
          <li>Brief context</li>
          <li>Multiple perspectives where appropriate</li>
        </ul>
      </section>

      <section className="about-section">
        <h2>Participation and integrity</h2>
        <p>
          To maintain basic integrity while keeping participation accessible:
        </p>
        <ul>
          <li>Voting is limited to one vote per verified account</li>
          <li>
            Participants must confirm whether they are Floyd County residents
            before participating
          </li>
          <li>
            Individual votes are not publicly associated with identities.
            Only aggregated results are displayed.
          </li>
        </ul>
      </section>

      <section className="about-section">
        <h2>What comes next</h2>
        <p>This is an early pilot.</p>
        <p>Future iterations may include:</p>
        <ul>
          <li>Additional civic processes</li>
          <li>Improved identity verification options</li>
          <li>Expanded ways to interpret results</li>
        </ul>
      </section>

      <section className="about-section about-contact">
        <h2>Contact</h2>
        <p>
          For questions or feedback:{" "}
          <a href="mailto:contact@civic.social">contact@civic.social</a>
        </p>
      </section>
    </div>
  );
}
