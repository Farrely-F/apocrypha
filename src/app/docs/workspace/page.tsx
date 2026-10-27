import { Article, C, Callout, H2, P, Terms, UL } from "@/components/docs/prose";
import { docMeta } from "@/lib/docs";

export const metadata = docMeta("workspace");

export default function Workspace() {
  return (
    <Article title="Organise your work" lead="Context on every project and environment, so nobody has to open one to find out what it is.">
      <H2>Organisations, projects, environments</H2>
      <UL>
        <li>An organisation holds people. Make one for each team, and use your personal one for yourself.</li>
        <li>A project is one app or service. Owners and admins create, rename and delete projects.</li>
        <li>An environment is a place a project runs. It has its own key, so you can share dev widely and keep prod narrow.</li>
        <li>A project always keeps at least one environment. To remove the last one, delete the project.</li>
      </UL>

      <H2>Describe a project</H2>
      <P>
        Choose <C>Add details</C> on a project (or <C>Edit details</C> from its row menu) to give it context:
      </P>
      <Terms
        items={[
          ["Description", "One or two lines, up to 280 characters. Shown under the name everywhere."],
          ["Tags", "Up to 8 short labels such as payments or mobile. Used to filter the project list."],
          ["Links", "A repository link and a docs link. Only https links, with no username or password."],
        ]}
      />
      <Callout tone="warn" title="Visible to the server">
        Names, descriptions, tags and links are stored in plaintext, like the names of projects and environments. Never put a secret in them.
      </Callout>

      <H2>Environment types</H2>
      <P>
        Each environment has a type: <C>dev</C>, <C>staging</C>, <C>prod</C> or <C>other</C>. It shows as a badge, with prod in red, so you can tell which
        one you are in before you change something. The type is guessed from the name (&quot;production&quot; becomes prod) and you can change it under
        <C>Edit</C> on the environment.
      </P>

      <H2>Find a project</H2>
      <UL>
        <li>
          The project list has a search box. It matches names, descriptions, tags and environment names, and works in your browser over what the page
          already has.
        </li>
        <li>
          The most used tags sit beside it as buttons. If there are more, the <C>more</C> menu lists the rest with counts. Pick several to narrow
          further; a project must have every tag you picked.
        </li>
        <li>
          <C>Ctrl</C> + <C>K</C> opens the command palette. It finds environments and projects by name, tag or type, and runs actions like locking the vault.
        </li>
      </UL>
      <P>
        Tags are suggested from the ones already used in the organisation, so spelling stays consistent. A tag is lowercase letters, digits and hyphens;
        &quot;Core API&quot; becomes <C>core-api</C>.
      </P>
    </Article>
  );
}
