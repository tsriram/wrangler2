import { fetchResult } from "./cfetch";
import type { Config } from "./config";
import type { CfWorkerInit } from "./worker";

export async function getMigrations(
  scriptName: string,
  accountId: string,
  config: Config
): Promise<CfWorkerInit["migrations"]> {
  // if config.migrations
  let migrations;
  if (config.migrations.length > 0) {
    // get current migration tag
    const scripts = await fetchResult<{ id: string; migration_tag: string }[]>(
      `/accounts/${accountId}/workers/scripts`
    );
    const script = scripts.find(({ id }) => id === scriptName);
    if (script?.migration_tag) {
      // was already published once
      const foundIndex = config.migrations.findIndex(
        (migration) => migration.tag === script.migration_tag
      );
      if (foundIndex === -1) {
        console.warn(
          `The published script ${scriptName} has a migration tag "${script.migration_tag}, which was not found in wrangler.toml. You may have already deleted it. Applying all available migrations to the script...`
        );
        migrations = {
          old_tag: script.migration_tag,
          new_tag: config.migrations[config.migrations.length - 1].tag,
          steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
        };
      } else {
        if (foundIndex !== config.migrations.length - 1) {
          // there are new migrations to send up
          migrations = {
            old_tag: script.migration_tag,
            new_tag: config.migrations[config.migrations.length - 1].tag,
            steps: config.migrations
              .slice(foundIndex + 1)
              .map(({ tag: _tag, ...rest }) => rest),
          };
        }
        // else, we're up to date, no migrations to send
      }
    } else {
      // first time publishing durable objects to this script,
      // so we send all the migrations
      migrations = {
        new_tag: config.migrations[config.migrations.length - 1].tag,
        steps: config.migrations.map(({ tag: _tag, ...rest }) => rest),
      };
    }
  }
  return migrations;
}

export function validateDurableObjects(
  config: Config,
  props: { legacyEnv: boolean | undefined }
) {
  // Some validation of durable objects + migrations
  if (config.durable_objects.bindings.length > 0) {
    // TODO: implement durable objects for service environments
    if (!props.legacyEnv) {
      throw new Error(
        "Using Durable Objects with service environments is not currently supported. This is being tracked at https://github.com/cloudflare/wrangler2/issues/739"
      );
    }

    // intrinsic [durable_objects] implies [migrations]
    const exportedDurableObjects = config.durable_objects.bindings.filter(
      (binding) => !binding.script_name
    );
    if (exportedDurableObjects.length > 0 && config.migrations.length === 0) {
      console.warn(
        `In wrangler.toml, you have configured [durable_objects] exported by this Worker (${exportedDurableObjects.map(
          (durable) => durable.class_name
        )}), but no [migrations] for them. This may not work as expected until you add a [migrations] section to your wrangler.toml. Refer to https://developers.cloudflare.com/workers/learning/using-durable-objects/#durable-object-migrations-in-wranglertoml for more details.`
      );
    }
  }
}
