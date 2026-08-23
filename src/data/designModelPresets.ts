/*
 * Copyright (c) 2021, Design Awareness Contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type { DesignModel } from "design-awareness-data-types";
import type { DeepRequired } from "../types/utility";
import { newDesignModel } from "./database";
import { WELL_KNOWN_ENTITY_PREFIX } from "./schema";

export const presetDesignModels = [
  [
    "edu.washington.hcde.atman@1",
    {
      name: "General design",
      description: {
        description:
          "This model is based on a synthesis of design models from seven books used to teach design to engineering students.",
        imageURL:
          "https://cdn.design-awareness.com/app-assets/models/gen-design-extended.svg",
        citation:
          "Cynthia J. Atman, 2019. Design timelines: Concrete and sticky representations of design process expertise. Design Studies, vol. 65, p. 125–151.",
        moreInfoURL:
          "https://www.sciencedirect.com/science/article/pii/S0142694X19300602",
      },
      activities: [
        {
          name: "Identify a need",
          code: "ID",
          description: "Identify a need/problem to solve",
          color: ["530D17", "FF9EA5"],
        },
        {
          name: "Problem Definition",
          code: "PD",
          description:
            "Define the problem (identify constraints, criteria, stakeholders, etc.)",
          color: ["AE1E60", "FFFFFF"],
        },
        {
          name: "Gather Information",
          code: "GATH",
          description: "Search for and gather information",
          color: ["DE1B54", "FF4D70"],
        },
        {
          name: "Generate Ideas",
          code: "GEN",
          description: "Think up potential solutions",
          color: ["F06E0A", "FF8324"],
        },
        {
          name: "Model",
          code: "MOD",
          description:
            "Detail how to build solution(s) to the problem to test a concept (e.g., prototyping)",
          color: ["B3820F", "EFC31A"],
        },
        {
          name: "Feasibility Analysis",
          code: "FEAS",
          description: "Assess workability of possible solutions",
          color: ["935FA7", "999999"],
        },
        {
          name: "Evaluation",
          code: "EVAL",
          description: "Compare and contrast possible solutions",
          color: ["0C8375", "14B8A5"],
        },
        {
          name: "Decision",
          code: "DEC",
          description: "Select idea or solution from among alternatives",
          color: ["567321", "87BB25"],
        },
        {
          name: "Communication",
          code: "COM",
          description: "Communicate the design to others",
          color: ["3761A4", "3884FF"],
        },
        {
          name: "Implementation",
          code: "IMPL",
          description: "Put a decision or plan into action",
          color: ["401073", "A93BF1"],
        },
      ],
    },
  ],
  [
    "edu.washington.hcde.atman_abbreviated@1",
    {
      name: "General design (abbreviated)",
      description: {
        description:
          "This model is based on a synthesis of design models from seven books used to teach design to engineering students. It is an abbreviated subset of activities.",
        imageURL:
          "https://cdn.design-awareness.com/app-assets/models/gen-design-abbrev.svg",
        citation:
          "Cynthia J. Atman, 2019. Design timelines: Concrete and sticky representations of design process expertise. Design Studies, vol. 65, p. 125–151.",
        moreInfoURL:
          "https://www.sciencedirect.com/science/article/pii/S0142694X19300602",
      },
      activities: [
        {
          name: "Problem Definition",
          code: "PD",
          description:
            "Define the problem (identify constraints, criteria, stakeholders, etc.)",
          color: ["AE1E60", "FFFFFF"],
        },
        {
          name: "Gather Information",
          code: "GATH",
          description: "Search for and gather information",
          color: ["DE1B54", "FF4D70"],
        },
        {
          name: "Generate Ideas",
          code: "GEN",
          description: "Think up potential solutions",
          color: ["F06E0A", "FF8324"],
        },
        {
          name: "Model",
          code: "MOD",
          description:
            "Detail how to build solution(s) to the problem to test a concept (e.g., prototyping)",
          color: ["B3820F", "EFC31A"],
        },
        {
          name: "Evaluation",
          code: "EVAL",
          description: "Compare and contrast possible solutions",
          color: ["0C8375", "14B8A5"],
        },
        {
          name: "Implementation",
          code: "IMPL",
          description: "Put a decision or plan into action",
          color: ["401073", "A93BF1"],
        },
      ],
    },
  ],
  [
    "edu.washington.hcde.design_model@1",
    {
      name: "Human Centered Design & Engineering model",
      description: {
        description:
          "This is one of the models used to teach design in the Human Centered Design & Engineering department at the University of Washington, Seattle.",
        imageURL: "https://cdn.design-awareness.com/app-assets/models/hcde.svg",
        moreInfoURL: "https://www.hcde.washington.edu/",
      },
      activities: [
        {
          name: "Research",
          code: "RES",
          description:
            "Gathering information to understand stakeholders’ needs, behaviors, motivations, etc.",
          color: ["DE1B54", "FF4D70"],
        },
        {
          name: "Ideate",
          code: "IDEA",
          description: "Process of generating new ideas",
          color: ["F06E0A", "FF8324"],
        },
        {
          name: "Prototype",
          code: "PROT",
          description: "A model to test a concept",
          color: ["B3820F", "EFC31A"],
        },
        {
          name: "Evaluate",
          code: "EVAL",
          description:
            "Evaluate potential solutions (e.g., with respect to effectiveness, efficiency, satisfaction).",
          color: ["0C8375", "14B8A5"],
        },
        {
          name: "Produce",
          code: "PRD",
          description: "Produce the product or system",
          color: ["401073", "A93BF1"],
        },
      ],
    },
  ],
  [
    "general.diverge_converge@1",
    {
      name: "Diverge/Converge",
      description: {
        description:
          "This model devides design activities into two categories: divergent activities and convergent activities.",
        imageURL:
          "https://cdn.design-awareness.com/app-assets/models/div-conv.svg",
        citation:
          "Banathy, Bela H.. Designing Social Systems in a Changing World. Germany, Springer US, 2013, p. 75.",
      },
      activities: [
        {
          name: "Diverging",
          code: "DIV",
          description:
            "Engaging in design activities that are inductive, creative and generative; focusing on possibilities, preserving ambiguity, generating alternatives, and creatively negotiating proposed design concepts",
          color: ["F06E0A", "FF8324"],
        },
        {
          name: "Converging",
          code: "CONV",
          description:
            "Engaging in design activities that are reductive, deliberative, analytical and decisive; reducing ambiguity",
          color: ["530D17", "FF9EA5"],
        },
      ],
    },
  ],
  [
    "general.problem_solution@1",
    {
      name: "Problem/Solution",
      description: {
        description:
          "This model divides design activities into two categories: problem space and solution space.",
        imageURL:
          "https://cdn.design-awareness.com/app-assets/models/prob-sol.svg",
        citation:
          "Dorst, K., 2019. Co-evolution and emergence in design. Design Studies, vol. 65, p. 60–77.\n\nK. Dorst and N. Cross, 2001. “Creativity in the design process: Co-evolution of problem–solution,” Design Studies, vol. 22, no. 5, p. 425–437.",
      },
      activities: [
        {
          name: "Problem Space",
          code: "PROB",
          description: "Understanding and/or defining the design challenge",
          color: ["0C8375", "14B8A5"],
        },
        {
          name: "Solution Space",
          code: "SOL",
          description: "Developing a solution",
          color: ["401073", "A93BF1"],
        },
      ],
    },
  ],
] as [
  string,
  {
    name: string;
    description: DeepRequired<DesignModel>["description"];
    activities: DeepRequired<DesignModel>["activities"];
  }
][];

export function createPresets(): Promise<void[]> {
  return Promise.all(
    presetDesignModels.map(async ([id, { name, activities, description }]) => {
        const designModel = newDesignModel();
        designModel.name = name;
        designModel.description = description;
        designModel.activities = activities;
        designModel.wellKnown = true;
        await (designModel.save as (id: string) => Promise<void>)(
          WELL_KNOWN_ENTITY_PREFIX + id
        );
    })
  );
}
