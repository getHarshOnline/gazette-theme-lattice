# Composing Lattice pages

The [presentation package](../presentation.toml) declares the exact component and resource contract. The [world brief](../WORLD.md) records the accepted composition and its reasons. Base’s `docs/page-families.md`, `docs/reading.md`, `docs/listings-and-cards.md` and `docs/films-and-scenes.md` own the shared behavior.

Authored programme and project pages can use grouped sections, reading measures and comparison plates. An index can use `research-directory` with `research-entry` children: each entry carries a linked H2, a question paragraph and a scope paragraph. The theme aligns these for comparison; the author owns their order, distinctions, qualifications and destinations. The enclosing component fence must be longer than its children's fences.

Project entrances use Base's `page-opening`, with a compact title role and supplied premise. `research-section` remains a separate analytical section composition. Continuous `research-reading` uses Base’s prose flow in `docs/reading.md`, retaining its reading measure and outer section intervals; heading type does not erase the boundary before a later argument.

Authored programme accounts use Base’s shared About anatomy in `docs/page-families.md`. Full-span and ordinary choice units retain the supplied centre, experiment and extension relationships; placement generates no dependency edges or sequence.

`research-comparison` places two authored source states beside one retained description and their separate answers. Supply `source`, `summary` and `question` as column labels, `retained` as the shared value, two `cases` with `state` and `answer`, and a `caption`. Its Markdown heading and body explain the example beside the framed table on wide screens. Narrow layouts put that explanation before the table, with the qualification centred beneath it. The native table retains the pair at narrow widths; it computes no result and needs no script. Authors must establish that both cases actually share the supplied description.

Home composes the source-owned continuous field and complete native resting views. [Design decisions](../WORLD.md#why-it-has-this-shape) explain its relationship to analytical and reading surfaces.

## Collection bookmarks

Collection directories inherit Base’s bookmark composition in `docs/listings-and-cards.md`. This world supplies type, material and artwork; shared anatomy determines capacity and spacing.

## Static research relationships

Research illustrations sit inside Base's `project-explanation`, which carries the supplied heading, prose and semantic children without world-specific layout arguments. Base owns the explanation's reading roles, spacing and product-context process density. Lattice retains independent forms for supplied relationships:

- `research-boundary` encloses a replaceable implementation within named interface surfaces. Supply `boundary_label`, a `surfaces` list, `implementation_label` and `implementation`.
- `research-alternatives` presents `candidates` with `title` and `body`; its Markdown body is the shared consequence beneath the entire set.
- `research-controls` renders `cases` with `question`, `held` and `changed`, using the supplied `held_label` and `changed_label`. Each controlled change stays joined to what remains fixed.

These static forms compute no result and introduce no interaction. They remain complete without scripts and retain their source order in print and narrow layouts. `research-comparison` and `research-register` retain their specialised illustrative anatomy within the same shared flow; these children introduce no extra amplitude. The retired `research-study` wrapper has no local replacement: explanations inherit Base's composition directly.

Ordered stages use Base's `process-path` with an authored `label` and `process-step` children. Each step supplies its heading and Markdown body. The stages remain complete and ordered without scripts; Base owns their optional enhancement.

The neutral [research specimen](../fixtures/research.landing.yaml) covers these forms, shared ordered stages and registers inside the shared explanation. [Its runner](../fixtures/research.py) reuses Base's native reading fixture, then checks rendered semantics, escaping, strict argument rejection and repeated output identity through the supplied engine release. Resource mounts are passed explicitly through `--resource-bindings`; it starts no server. A native pass does not establish visual acceptance.

## Generated editorial indexes

Generated article listings inherit Base's compact `reading-list`: each entry keeps its linked title, supplied author attribution and publication date, and summary in one reading track. Base owns the anatomy, measure and responsive spacing; this world supplies its existing type and material roles. Missing metadata stays absent. Authored collection and sequence contents retain their `publication-index` forms, while explicitly selected collection directories keep their bookmark composition.

## Canonical project and service selectors

`lattice/product.html`, `lattice/product-listing.html` and `lattice/services.html` inherit Base's detail, directory and service compositions. The world selectors add the existing font declarations; Base owns their shared body roles and anatomy. Content owns introductions, demonstrations, status, destinations, questions and answers. The composing workspace selects the service composition only where actual offers are supplied; templates supply no copy or offers.

`lattice/research.html` remains a compatibility selector for `lattice/product.html`.

## Shared frame and focus ownership

The authored field supplies its scene contrast and fixed dark action pair; interiors retain the current colour mode. Base owns controls and focus painting, described in its `docs/settings-and-states.md`. Analytical squares and open rails keep their geometry independently of functional optical surfaces.

The authored account uses its source headings while the native document title remains available to navigation and metadata.

Part of [gazette-theme-lattice](../README.md).
