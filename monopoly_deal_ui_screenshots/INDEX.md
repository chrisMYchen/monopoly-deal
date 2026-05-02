# Monopoly Deal — UI/UX Screenshot Index

Source: https://www.youtube.com/watch?v=ArjTIEWV874
Resolution: 1280x720

| # | File | What it shows |
|---|------|---------------|
| 01 | `01_intro_board_layout_lets_play_prompt.jpg` | Main table layout with three player slots around a circular board, central deck, and an empty hand zone. "Let's play! Get your cards!" header introduces the active player. Train and blimp world-decoration around the board. |
| 02 | `02_dealing_animation_action_cards_to_hand.jpg` | Initial deal — five face-up Action Cards (Debt Collector, It's My Birthday, Rent…) cascading into the player's hand. Player slots show updated card-count badges (`x5`). |
| 03 | `03_property_card_inspect_with_rent_table.jpg` | Card inspector overlay — a Property card (Virginia Avenue) is enlarged showing its rent ladder (1, 2, 4) tied to set completion. Player avatar moves to the bottom of the screen for the active turn. |
| 04 | `04_play_zone_target_pin_indicator.jpg` | Drop-target affordance — a glowing blue play zone with a pin marker indicating where a card will be placed before commit. |
| 05 | `05_hand_browse_select_card_play_card_prompt.jpg` | Hand browser — multiple cards spread out for inspection, with input legend at the bottom: `Select card` / `Play card`. |
| 06 | `06_property_wildcard_tooltip_full_action_bar.jpg` | Property Wild Card flow — right-side tooltip explains the rule, the full contextual action bar is visible: `Rotate board`, `Look through cards`, `Play card`, `Turn wildcard`, `Zoom in`, `End turn`. |
| 07 | `07_sly_deal_steal_property_prompt_steal_back.jpg` | Sly Deal interaction — banner prompt "Now, select an available property to deal." with the active card pinned to the right and a target reticle on the opponent's property. Action legend: `Steal this card` / `Back`. |
| 08 | `08_opponent_turn_pick_2_cards_banner.jpg` | Opponent turn-state — focus shifts to the other player with a "Pick 2 cards" banner showing which sub-action they're in. |
| 09 | `09_wildcard_assign_to_color_set.jpg` | Wild card placement — a Property Wild Card sits on the right with both color faces visible; ghost slots show valid color groups it can join. Action legend: `Select set` / `Play Wild Card` / `Back`. |
| 10 | `10_rent_card_tooltip_color_explanation.jpg` | Rent Card with right-side tooltip: "All players pay you rent for properties you own in one of these colors." Money cards visible in player tray. |
| 11 | `11_forced_deal_action_card_tooltip.jpg` | Forced Deal action card — tooltip "Select one of your cards and exchange it with an opponent." Hand fanned out underneath. |
| 12 | `12_double_the_rent_charge_money_cards.jpg` | Double The Rent — two highlighted money cards (M4, M5) elevated on the table to show the amount being charged, with the action card stack on the right. |
| 13 | `13_debt_collector_action_card_tooltip.jpg` | Debt Collector action card with tooltip "Charge one player M5M." Multiple action cards visible in the open hand. |
| 14 | `14_money_cards_paid_to_collector.jpg` | Payment resolution — three money cards (M1, M1, M3) lifted off the table to visualize the payment from the targeted player to the active player. |
| 15 | `15_just_say_no_defense_card_tooltip.jpg` | Just Say No defensive card with tooltip "Use this card to cancel an action against you." |
| 16 | `16_deal_breaker_steal_complete_set_tooltip.jpg` | Deal Breaker action card with tooltip "Select a player and steal one of their complete sets." |
| 17 | `17_results_screen_winner_trophy_leaderboard.jpg` | End-of-game results screen — trophy graphic, fireworks, winner banner with time/money totals, ranked player avatars (1st, 2nd, 3rd), `Restart` / `Quit` legend. |

## UI/UX patterns observed
- Top banner used for player turn state and action sub-prompts.
- Right-side panel for context-sensitive tooltips on every card type.
- Bottom legend bar mirrors controller buttons (PS triangle/X/square/circle) for every available action — changes contextually.
- Player avatars + card-count badges around the board, repositioned so the active player is always at the bottom.
- Ghost/glowing drop zones and pin markers signal valid targets before commit.
- Card movements (deal, pay, steal) are physically lifted/elevated on the 3D table to communicate state changes.
