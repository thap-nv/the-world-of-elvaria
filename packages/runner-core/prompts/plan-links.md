<!-- User part of the judge of a plan quest, inside the review (review.md, {{plan_links}}), when its territory has a
code graph built at the plan's base commit and two sub-quests that may run at once, with scopes apart, have code that
uses each other's (planLinksOf, PS-21b). A warning, never a fail: the machine half of the review (planIssuesOf)
passes such a plan. Empty otherwise, and the review reads as before. -->

# Sub-quests linked through the code

The code graph at this quest's base commit links code of these sub-quests, which may run at the same time with scopes apart:

{{links}}

This fails nothing by itself. Judge each pair: when one changes what the other relies on, they should not run side by side; then the plan has one wait for the other (`depends_on_refs`), or draws their scopes again. Say so in your notes.
