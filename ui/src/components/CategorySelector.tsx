import type { DraftCategory } from "../services/api";

const CATEGORIES: Array<{
  value: DraftCategory;
  label: string;
  description: string;
}> = [
  {
    value: "issue",
    label: "Issue",
    description:
      "A concern, problem, or factual matter you want the community to consider.",
  },
  {
    value: "idea",
    label: "Idea",
    description:
      "A preference or aspiration — something you'd like to see happen.",
  },
  {
    value: "project",
    label: "Project",
    description:
      "A concrete initiative you or someone else could organize.",
  },
];

interface Props {
  value: DraftCategory | null;
  onChange: (category: DraftCategory) => void;
  disabled?: boolean;
}

export default function CategorySelector({ value, onChange, disabled }: Props) {
  return (
    <fieldset className="category-selector" disabled={disabled}>
      <legend className="form-label">
        Category <span className="required">*</span>
      </legend>
      <div className="category-cards">
        {CATEGORIES.map((cat) => (
          <label
            key={cat.value}
            className={`category-card${value === cat.value ? " selected" : ""}`}
          >
            <input
              type="radio"
              name="proposal-category"
              value={cat.value}
              checked={value === cat.value}
              onChange={() => onChange(cat.value)}
              className="category-radio"
            />
            <span className="category-card-label">{cat.label}</span>
            <span className="category-card-desc">{cat.description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
