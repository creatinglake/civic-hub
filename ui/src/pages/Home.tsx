import HubInfo from "../components/HubInfo";
import Feed from "../components/Feed";
import FeedFilter, {
  useFeedFilter,
  useFilterPredicate,
} from "../components/FeedFilter";
import FeedVotesTabs from "../components/FeedVotesTabs";

export default function Home() {
  const { active, setActive } = useFeedFilter();
  const filter = useFilterPredicate(active);

  return (
    <div className="page page-home">
      <HubInfo />
      {/* Slice 12.1 — primary tabs between the chronological Feed and
          the action-oriented Votes page. Persistent across both routes
          so the user always knows the toggle is there. The
          context-specific surfaces (filter pills here; suggest-a-vote
          CTA on Votes) live below the tabs so they only appear in the
          relevant context. */}
      <FeedVotesTabs />
      <FeedFilter active={active} onChange={setActive} />
      <Feed
        filter={filter}
        emptyFilteredAction={
          active === "all"
            ? null
            : { label: "Show all activity", onClick: () => setActive("all") }
        }
      />
    </div>
  );
}
