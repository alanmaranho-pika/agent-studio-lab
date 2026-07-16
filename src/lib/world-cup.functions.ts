// World Cup 2026 Video — multi-step pipeline that:
//   1. Generates a fake live FIFA broadcast screenshot of the user in the
//      stands via GPT Image 2 /edit (using the user's selfie as reference).
//   2. Animates that broadcast image into a 10s clip with Seedance 2.0
//      reference-to-video, using a scenario-specific motion prompt.
// Both intermediate (image) and final (video) outputs are stored in the
// project so they show up in the library/outputs panel.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const WORLD_CUP_TEAMS = [
  "Brazil",
  "Argentina",
  "France",
  "Germany",
  "Spain",
  "England",
  "Portugal",
  "Netherlands",
  "Italy",
  "Belgium",
  "Croatia",
  "Uruguay",
  "Mexico",
  "USA",
  "Canada",
  "Japan",
  "South Korea",
  "Morocco",
  "Senegal",
  "Colombia",
] as const;

export type WorldCupScenarioId =
  | "score_goal"
  | "spill_drink"
  | "announcer_callout"
  | "kiss_cam"
  | "wild_celebration"
  | "catch_souvenir"
  | "wave_flag"
  | "halftime_dance"
  | "mascot_tackle"
  | "vuvuzela_solo"
  | "nacho_helmet"
  | "proposal_fail"
  | "streaker_chase"
  | "ref_argument"
  | "crowd_surf"
  | "shirtless_paint"
  | "tifo_unveil"
  | "name_chant"
  | "anthem_solo"
  | "photobomb_reporter"
  | "beer_snake";

export const WORLD_CUP_SCENARIOS: ReadonlyArray<{
  id: WorldCupScenarioId;
  label: string;
  hint: string;
  bonus?: boolean;
}> = [
  { id: "score_goal", label: "Score a goal", hint: "Called down to the pitch and rip a stunner." },
  { id: "spill_drink", label: "Spill drink and embarrass myself", hint: "Beer goes everywhere on the JumboTron." },
  { id: "announcer_callout", label: "Get called out by the announcer", hint: "Whole stadium turns — go shy on camera." },
  { id: "kiss_cam", label: "Get caught on the kiss cam", hint: "Surprise kiss cam moment." },
  { id: "wild_celebration", label: "Wild celebration when my team scores", hint: "Lose your mind when the goal goes in." },
  { id: "catch_souvenir", label: "Catch a souvenir ball", hint: "Snag a ball out of the air mid-broadcast." },
  { id: "wave_flag", label: "Wave my team flag dramatically", hint: "Massive flag, full broadcast spotlight." },
  { id: "halftime_dance", label: "Bust out a halftime dance", hint: "Dance cam catches you going off." },
  { id: "mascot_tackle", label: "Get bodyslammed by the mascot", hint: "Tournament mascot launches into the stands.", bonus: true },
  { id: "vuvuzela_solo", label: "Rip an absurd vuvuzela solo", hint: "Six-foot horn, full broadcast attention.", bonus: true },
  { id: "nacho_helmet", label: "Wear nachos as a hat", hint: "Cheese-helmet, JumboTron close-up.", bonus: true },
  { id: "proposal_fail", label: "Botch a JumboTron proposal", hint: "Drop the ring, fumble the moment.", bonus: true },
  { id: "streaker_chase", label: "Get chased by security across the stands", hint: "You start the wave, security misreads it.", bonus: true },
  { id: "ref_argument", label: "Lecture the referee from the stands", hint: "Stand up, point, give the ref a piece of your mind.", bonus: true },
  { id: "crowd_surf", label: "Accidentally crowd surf during a goal", hint: "Celebration goes airborne, you don't come down.", bonus: true },
  { id: "shirtless_paint", label: "Body-paint reveal at full volume", hint: "Rip the jersey, full team paint underneath.", bonus: true },
  { id: "tifo_unveil", label: "Unveil a giant tifo with my face on it", hint: "Section-wide banner drops with your portrait.", bonus: true },
  { id: "name_chant", label: "Get the whole stadium chanting my name", hint: "60,000 people, one syllable: yours.", bonus: true },
  { id: "anthem_solo", label: "Sing the national anthem solo on the JumboTron", hint: "Mic finds you, you absolutely send it.", bonus: true },
  { id: "photobomb_reporter", label: "Photobomb the sideline reporter", hint: "Live hit, you in frame, full chaos.", bonus: true },
  { id: "beer_snake", label: "Build a legendary beer cup snake", hint: "Twenty-cup tower stacked above the section.", bonus: true },
];

export function pickOpponent(team: string): string {
  // Pre-baked rivalries for narrative flair; default to Argentina otherwise.
  const map: Record<string, string> = {
    Brazil: "Argentina",
    Argentina: "Brazil",
    France: "Germany",
    Germany: "France",
    Spain: "Portugal",
    Portugal: "Spain",
    England: "Germany",
    Netherlands: "Belgium",
    Italy: "Spain",
    Belgium: "Netherlands",
    Croatia: "Argentina",
    Uruguay: "Brazil",
    Mexico: "USA",
    USA: "Mexico",
    Canada: "USA",
    Japan: "South Korea",
    "South Korea": "Japan",
    Morocco: "France",
    Senegal: "England",
    Colombia: "Brazil",
  };
  return map[team] ?? "Argentina";
}

// -------------------------------------------------------------------------
// Broadcast language — drives on-screen graphics + announcer voice.
// -------------------------------------------------------------------------

export const WORLD_CUP_LANGUAGES = [
  "English",
  "Spanish",
  "Portuguese",
  "French",
  "German",
  "Italian",
  "Dutch",
  "Japanese",
  "Korean",
  "Arabic",
] as const;

export type WorldCupLanguage = (typeof WORLD_CUP_LANGUAGES)[number];

export function defaultLanguageForTeam(team: string): WorldCupLanguage {
  const map: Record<string, WorldCupLanguage> = {
    Brazil: "Portuguese",
    Portugal: "Portuguese",
    Argentina: "Spanish",
    Spain: "Spanish",
    Mexico: "Spanish",
    Colombia: "Spanish",
    Uruguay: "Spanish",
    France: "French",
    Senegal: "French",
    Morocco: "Arabic",
    Germany: "German",
    Italy: "Italian",
    Netherlands: "Dutch",
    Belgium: "Dutch",
    Croatia: "English",
    England: "English",
    USA: "English",
    Canada: "English",
    Japan: "Japanese",
    "South Korea": "Korean",
  };
  return map[team] ?? "English";
}

export function buildImagePrompt(
  team: string,
  opponent: string,
  language: WorldCupLanguage = "English",
): string {
  return [
    `A candid screenshot from a live FIFA World Cup 2026 TV broadcast on a ${language}-language sports network. The camera has just cut to the crowd during a tense match — our reference image person is shown in the stands, completely unaware they are on camera.`,
    `Critical: the subject is NOT looking at the camera. Their gaze is directed toward the pitch / the action on the field, eyes off-axis from the lens. Natural, unposed expression — mid-reaction to the match, maybe mid-sip of a drink, mid-laugh with a friend, or focused on the play. No eye contact with the broadcast camera whatsoever.`,
    `The subject is wearing ${team} national team colors and seated in premium lower-bowl seats near the pitch.`,
    `Hardlock: Do not alter their facial structure and maintain their exact likeness.`,
    `Full broadcast presentation: official World Cup-style scorebug, network logo watermark, match clock, scoreline, and tournament graphics. All on-screen graphics, scorebug text, lower-third name plates, network branding, ticker, and commentary captions are written in ${language} — use natural, correctly-spelled ${language} typography appropriate for a major ${language}-language sports broadcaster. 16:9 aspect ratio.`,
    `The image looks exactly like a real television broadcast screenshot — authentic sports broadcast color grading, realistic stadium lighting, slight compression artifacts, subtle interlacing grain, shallow broadcast-camera depth of field, and a packed crowd in the background.`,
    `It's ${team} vs. ${opponent} in the FIFA World Cup 2026 quarterfinals. The match is being played in a sold-out stadium. The scoreboard shows ${team} leading 2–1 in the 78th minute.`,
    `The crowd is energized and tense. The broadcast camera has caught the subject in a candid, unguarded moment — they have no idea they're being broadcast to millions.`,
  ].join(" ");
}

export function buildVideoPrompt(args: {
  scenario: WorldCupScenarioId;
  name: string;
  team: string;
  language?: WorldCupLanguage;
}): string {
  const { scenario, name, team, language = "English" } = args;
  const broadcastTail =
    `Throughout: broadcast overlay with live score and match timer in the corner, sports network watermark in the top-right, all on-screen graphics and lower-thirds rendered in ${language}, shallow depth of field with sharp focus on the subject, slightly blurred crowd background, natural arena floodlighting, authentic live TV color grading, subtle broadcast compression artifacts, and a genuine live sports broadcast aesthetic. The play-by-play announcer, color commentator, and stadium PA all speak ${language} with natural, idiomatic ${language} sports-broadcast cadence — energetic, professional, native-speaker delivery. Any spoken or shouted dialogue (PA announcements, chants, commentary) is in ${language}.`;

  const intro =
    `Ultra-realistic sports broadcast video, cinematic night match atmosphere. A spectator subject sits in a packed football stadium surrounded by fans in ${team} jerseys and scarves.`;

  switch (scenario) {
    case "score_goal":
      return [
        intro,
        `The subject is mid-drink with a beer cup in one hand and holding a half-eaten French fry in the other.`,
        `Suddenly the stadium PA booms their name: "${name}" — the subject freezes, eyes wide, as the surrounding crowd notices and begins cheering. The subject carefully sets down the beer cup, finishes the French fry, wipes their hand with a tissue, and tosses it aside.`,
        `The subject stands up, slides past the row of fans, and walks purposefully down the stadium steps toward the pitch. They step onto the field as the crowd murmurs with anticipation. The football players on the field toss the ball toward them.`,
        `The subject lines up, takes two measured steps, and delivers a powerful, clean kick straight through the goal posts. The stadium erupts.`,
        `They turn, jog back toward the broadcast camera with a huge grin, reach both arms forward, and completely cover the lens with their open palms. The screen goes black.`,
        broadcastTail,
      ].join(" ");

    case "spill_drink":
      return [
        intro,
        `The subject is holding a giant overflowing beer in one hand and a tray of nachos in the other.`,
        `${team} suddenly attacks the goal — the subject leaps up to celebrate, knocks into the fan in front of them, and the entire beer cascades down the row in slow motion. Nachos fly everywhere.`,
        `The JumboTron cuts to a close-up of the subject on the big screen, face frozen in pure horror, mouth open in an "oh no" expression as cheese drips off their jersey.`,
        `Surrounding fans burst out laughing and pointing. The subject covers their face with both hands, peeks through their fingers at the camera, and gives a sheepish thumbs-up.`,
        `The stadium camera lingers on their reaction. Caption-style "${name}" name graphic flashes across the lower-third broadcast overlay.`,
        broadcastTail,
      ].join(" ");

    case "announcer_callout":
      return [
        intro,
        `The subject is quietly enjoying the match, calm and focused on the pitch.`,
        `The booming stadium PA suddenly calls their name: "Let's hear it for ${name} in section 112!" The entire stadium turns and looks directly at them. A spotlight hits.`,
        `The subject's eyes widen, they pull their ${team} scarf up over their mouth, and shrink down in their seat trying to disappear. The crowd starts chanting "${name}! ${name}! ${name}!"`,
        `Reluctantly, the subject gives a tiny, shy wave to the camera, then buries their face in their hands as the whole row laughs and pats them on the back.`,
        `Cut back to the broadcast camera zooming in on their flushed, smiling face.`,
        broadcastTail,
      ].join(" ");

    case "kiss_cam":
      return [
        intro,
        `The subject is laughing with friends in the stands when a giant pink "KISS CAM" heart graphic suddenly frames them on the JumboTron.`,
        `The crowd immediately roars "Kiss! Kiss! Kiss!" The subject looks up, sees themselves on the giant screen, and their face goes bright red.`,
        `They turn to the person next to them, hesitate awkwardly, then plant a quick, dramatic kiss on the cheek as the stadium erupts in cheers and applause.`,
        `The broadcast cuts back to a wide shot, both fans grinning and waving, with "${name}" stylized in the broadcast lower-third.`,
        broadcastTail,
      ].join(" ");

    case "wild_celebration":
      return [
        intro,
        `${team} is attacking. The subject is on the edge of their seat, scarf raised.`,
        `${team} scores. The subject explodes — leaps into the air with both arms raised, screaming with pure joy, hugs every stranger in the row, pulls their jersey over their head, and runs in place pumping their fists.`,
        `Confetti and streamers fly. The broadcast camera locks on them as the slow-motion replay graphic spins onto the screen with the caption "${name} — Section 112".`,
        `The subject points two fingers at the broadcast camera, mouths "LET'S GO", and bellows in celebration as the crowd around them goes equally feral.`,
        broadcastTail,
      ].join(" ");

    case "catch_souvenir":
      return [
        intro,
        `The subject is chatting calmly with friends when a football suddenly comes flying out of the pitch toward the stands.`,
        `Time slows. The subject's eyes lock on the ball, they leap up out of their seat, stretch both arms overhead, and snatch the ball cleanly out of the air with one hand.`,
        `They land, look at the ball, then look at the broadcast camera in disbelief. Surrounding fans erupt in cheers and ruffle their hair.`,
        `The subject grins, holds the ball high above their head like a trophy, and kisses it as the broadcast lower-third flashes "${name} — Catch of the Tournament".`,
        broadcastTail,
      ].join(" ");

    case "wave_flag":
      return [
        intro,
        `The subject reaches down and unfurls an enormous ${team} flag that drapes across three rows of fans.`,
        `They stand and wave the flag in slow, sweeping arcs over their head as the surrounding crowd cheers and sings the national anthem.`,
        `The broadcast camera pushes in for a hero shot — slow-motion fabric ripples, stadium lights catching the colors. The lower-third reads "${name} — Section 112".`,
        `The subject lowers the flag, locks eyes with the camera, kisses the team crest, and roars into the lens.`,
        broadcastTail,
      ].join(" ");

    case "halftime_dance":
      return [
        intro,
        `It's halftime. The DJ kicks the music up and the "DANCE CAM" graphic suddenly frames the subject on the JumboTron.`,
        `The subject sees themselves on the giant screen, breaks into a huge grin, and starts going off — full body dance moves, spins, and a finishing pose with both arms in the air.`,
        `The entire stand joins in. Cheerleaders down on the field point up at them. The broadcast lower-third reads "${name} — Section 112 MVP".`,
        `The subject finishes with a dramatic bow, blows a kiss at the camera, and drops back into their seat laughing.`,
        broadcastTail,
      ].join(" ");

    case "mascot_tackle":
      return [
        intro,
        `The subject is calmly eating popcorn when the giant fuzzy tournament mascot bursts down the aisle, locks eyes with them, and launches into a full WWE-style flying tackle into their row.`,
        `Popcorn explodes everywhere in slow motion. Surrounding fans scatter, laughing and filming on their phones.`,
        `The subject and the mascot wrestle playfully across the seats. The subject emerges victorious, holding the mascot's oversized foam head above them like a trophy.`,
        `The broadcast camera zooms in. Lower-third reads "${name} vs. The Mascot — Section 112". The subject roars at the camera and puts the mascot head on.`,
        broadcastTail,
      ].join(" ");

    case "vuvuzela_solo":
      return [
        intro,
        `The subject pulls out a comically oversized six-foot-long vuvuzela from under their seat. Fans around them brace and cover their ears in anticipation.`,
        `They inhale dramatically, put the horn to their lips, and unleash an absurdly loud, sustained blast that makes the entire section visibly recoil and laugh.`,
        `The broadcast camera cuts to them. Players on the pitch glance up. Commentators react. The lower-third reads "${name} — Section 112 Brass Section".`,
        `The subject finishes the note, gives a small modest bow, and casually sits back down sipping a beer as if nothing happened.`,
        broadcastTail,
      ].join(" ");

    case "nacho_helmet":
      return [
        intro,
        `The subject is wearing a giant tray of nachos balanced on top of their head like a hat — cheese dripping down the sides of their ${team} jersey.`,
        `They grin proudly at the camera, then casually reach up, grab a chip from the helmet, dip it in the cheese still on their head, and eat it.`,
        `Surrounding fans crack up and start filming. The JumboTron cuts to a close-up. A "WHY?" graphic flashes across the broadcast lower-third with "${name} — Section 112".`,
        `The subject offers a chip to the fan next to them, who politely declines. They shrug, eat another, and salute the camera with cheesy fingers.`,
        broadcastTail,
      ].join(" ");

    case "proposal_fail":
      return [
        intro,
        `The JumboTron cuts to the subject and a date in the stands. A pink "WILL YOU MARRY ME?" graphic frames them. The crowd "ooohs".`,
        `The subject fumbles in their pocket, pulls out a tiny ring box — and immediately drops it. It bounces down three rows of seats in slow motion as fans dive to catch it.`,
        `A stranger triumphantly retrieves the ring and passes it back. The subject, red-faced, drops to one knee and offers it shakily. Their date bursts out laughing and nods yes.`,
        `The whole stadium erupts. Confetti drops. Lower-third reads "${name} — She Said Yes (Eventually)".`,
        broadcastTail,
      ].join(" ");

    case "streaker_chase":
      return [
        intro,
        `The subject stands up to start a stadium wave, arms raised. Two yellow-jacket security guards in the aisle misread it completely and start sprinting toward them.`,
        `The subject's eyes widen — they take off running across the row of seats, hopping from chair to chair as fans cheer them on. The security guards give chase, fumbling behind.`,
        `The broadcast camera tracks the whole comedic chase. A "RUN ${name.toUpperCase()} RUN" graphic flashes onto the JumboTron. The crowd is on their feet roaring.`,
        `Eventually the subject stops, raises both hands in surrender with a huge grin, and gets gently escorted away waving to the camera like a celebrity.`,
        broadcastTail,
      ].join(" ");

    case "ref_argument":
      return [
        intro,
        `A controversial call is made on the pitch. The subject leaps to their feet, completely incensed, and starts gesturing furiously at the referee from the stands.`,
        `They mime an offside flag, then a yellow card, then throw both arms up in disbelief. Surrounding fans nod along supportively. The referee actually glances up.`,
        `The broadcast cuts to the subject mid-tirade. Commentators are laughing. Lower-third reads "${name} — Tactical Analyst, Section 112".`,
        `The subject finishes their lecture, sits down satisfied, takes a long sip of their beer, and gives the referee one final disapproving head shake.`,
        broadcastTail,
      ].join(" ");

    case "crowd_surf":
      return [
        intro,
        `${team} scores a stunning goal. The subject leaps up in celebration — and the row of fans behind them immediately hoists them overhead.`,
        `They start crowd-surfing across the section, completely horizontal, ${team} scarf flying behind them like a cape. Their face cycles from shock to pure joy.`,
        `The broadcast camera tracks them floating across a sea of hands. The lower-third reads "${name} — Section 112 Takeoff". Fans below them sing the team chant.`,
        `They eventually get gently lowered back into their seat, dazed and grinning, hair completely messed up. They give the camera a slow, stunned thumbs-up.`,
        broadcastTail,
      ].join(" ");

    case "shirtless_paint":
      return [
        intro,
        `The subject stands up and dramatically rips off their ${team} jersey in one swift motion. Underneath: their entire torso is painted in full ${team} colors with the team crest across the chest.`,
        `They flex both arms, let out a primal roar, and pound their painted chest. The surrounding fans lose their minds and start chanting their name.`,
        `The broadcast camera locks on for a hero close-up. The JumboTron cuts to them. Lower-third reads "${name} — Section 112 Ultra".`,
        `The subject spins around to reveal the team name painted across their back in huge block letters, then points two fingers at the camera with a wild grin.`,
        broadcastTail,
      ].join(" ");


    case "tifo_unveil":
      return [
        intro,
        `On a coordinated cue, the entire section behind the subject unfurls a massive tifo banner that stretches across dozens of rows — and the giant portrait painted on it is unmistakably the subject's own face in ${team} colors.`,
        `The subject turns around, sees their enormous face towering over them, and doubles over laughing in disbelief before raising both arms triumphantly.`,
        `The broadcast cuts to a wide shot of the tifo with the real subject standing in front of it. Lower-third reads "${name} — Section 112 Legend".`,
        `They turn back to the camera, kiss two fingers, and point them at the lens as the tifo ripples behind them.`,
        broadcastTail,
      ].join(" ");

    case "name_chant":
      return [
        intro,
        `A lone fan a few rows back starts chanting the subject's name: "${name}! ${name}!" — within seconds the entire section picks it up, then the whole stand, then the entire stadium.`,
        `The subject sits frozen for a beat as 60,000 voices roar their name in unison, then slowly stands up, hand over their heart, completely overwhelmed.`,
        `The broadcast camera pushes in. Lower-third reads "${name} — Section 112". The PA mic picks up the chant booming through the bowl.`,
        `They raise both arms, conduct the chant for a few bars like a maestro, then bow deeply and sit back down grinning ear to ear.`,
        broadcastTail,
      ].join(" ");

    case "anthem_solo":
      return [
        intro,
        `Pre-match ceremony. A stadium attendant rushes up the aisle and hands the subject a wireless microphone — the scheduled anthem singer is a no-show and the subject has been picked from the crowd.`,
        `The subject stands, takes a breath, and absolutely sends a soaring, pitch-perfect rendition of the ${team} national anthem. The whole stadium rises, hands on hearts.`,
        `The broadcast camera holds a tight close-up. JumboTron mirrors it. Lower-third reads "${name} — Anthem, Live from Section 112". Players on the pitch sing along.`,
        `They hit the final note, hold it, and the stadium erupts in applause. The subject hands the mic back with a humble nod and a single tear.`,
        broadcastTail,
      ].join(" ");

    case "photobomb_reporter":
      return [
        intro,
        `A sideline reporter in a sharp blazer is doing a live hit from the stands, mic in hand, camera operator framed up tight. The subject is sitting directly behind them.`,
        `The subject realizes they're on live TV and immediately goes for it — pulling exaggerated faces, waving a ${team} scarf overhead, pointing at the back of the reporter's head, and mouthing "HI MOM" at the camera.`,
        `The reporter, oblivious, keeps delivering their report as the subject's antics escalate behind them. Lower-third reads "${name} — Section 112". Commentators in-studio start laughing.`,
        `The reporter finally turns around, catches the subject mid-pose, and bursts out laughing. The subject offers a sheepish wave and a thumbs-up to the camera.`,
        broadcastTail,
      ].join(" ");

    case "beer_snake":
      return [
        intro,
        `The subject is carefully stacking empty plastic beer cups end-to-end into a long, wobbling tower — a stadium-famous "beer snake" — that already stretches a full row long above their head.`,
        `Surrounding fans pass up more empty cups in a steady relay. The subject delicately adds them one by one, tongue out in concentration, as the snake grows past twenty cups tall.`,
        `The broadcast camera notices and cuts to the snake, then pulls back to reveal the subject as its proud architect. Lower-third reads "${name} — Section 112 Beer Snake Architect".`,
        `The subject lifts the entire wobbling tower triumphantly above their head, the whole section roars, and the snake sways dramatically as they grin at the camera.`,
        broadcastTail,
      ].join(" ");
  }
}

const Input = z.object({
  projectId: z.string().uuid(),
  refImageUrl: z.string().url(),
  team: z.string().min(1).max(80),
  opponent: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(80),
  scenario: z.enum([
    "score_goal",
    "spill_drink",
    "announcer_callout",
    "kiss_cam",
    "wild_celebration",
    "catch_souvenir",
    "wave_flag",
    "halftime_dance",
    "mascot_tackle",
    "vuvuzela_solo",
    "nacho_helmet",
    "proposal_fail",
    "streaker_chase",
    "ref_argument",
    "crowd_surf",
    "shirtless_paint",
    "tifo_unveil",
    "name_chant",
    "anthem_solo",
    "photobomb_reporter",
    "beer_snake",
  ]),
  language: z.enum(WORLD_CUP_LANGUAGES).optional(),
});

export type WorldCupSuccess = {
  ok: true;
  image: { assetId: string; assetUrl: string; mime: string };
  video: { assetId: string; assetUrl: string; mime: string };
  imagePrompt: string;
  videoPrompt: string;
};

export type WorldCupFailure = {
  ok: false;
  stage: "image" | "video" | "store" | "unknown";
  message: string;
};

export type WorldCupResult = WorldCupSuccess | WorldCupFailure;

export const produceWorldCup2026Video = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<WorldCupResult> => {
    const { falRun, falPickImageUrl, falPickVideoUrl } = await import("@/lib/fal.server");
    const { downloadAndStoreUrl } = await import("@/lib/project-assets.server");

    const opponent = data.opponent ?? pickOpponent(data.team);

    // Track in render_jobs so it surfaces in the Jobs page like other long
    // multi-step renders.
    const { data: jobRow } = await context.supabase
      .from("render_jobs")
      .insert({
        project_id: data.projectId,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const renderJobId = (jobRow?.id as string | undefined) ?? null;

    const markFailed = async (msg: string) => {
      if (!renderJobId) return;
      await context.supabase
        .from("render_jobs")
        .update({
          status: "failed",
          error: msg,
          finished_at: new Date().toISOString(),
        })
        .eq("id", renderJobId);
    };

    const fail = async (stage: WorldCupFailure["stage"], err: unknown): Promise<WorldCupFailure> => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[world-cup] ${stage} failed:`, message);
      await markFailed(`${stage}: ${message}`);
      return { ok: false, stage, message };
    };

    // 1. Broadcast screenshot via GPT Image 2 /edit (uses the selfie).
    const language = data.language ?? defaultLanguageForTeam(data.team);
    const imagePrompt = buildImagePrompt(data.team, opponent, language);
    let imageUrl: string | null = null;
    let storedImg: { id: string; url: string; mime: string };
    try {
      const imgOut = await falRun(
        "openai/gpt-image-2/edit",
        {
          prompt: imagePrompt,
          image_urls: [data.refImageUrl],
          image_size: "landscape_16_9",
          quality: "high",
          num_images: 1,
          output_format: "png",
        },
        { label: "gpt-image-2/edit", timeoutMs: 10 * 60_000 },
      );
      imageUrl = falPickImageUrl(imgOut);
      if (!imageUrl) {
        return fail("image", new Error(
          `gpt-image-2 returned no image URL. Raw: ${JSON.stringify(imgOut).slice(0, 400)}`,
        ));
      }
    } catch (err) {
      return fail("image", err);
    }

    try {
      storedImg = await downloadAndStoreUrl({
        projectId: data.projectId,
        userId: context.userId,
        sourceUrl: imageUrl,
        kind: "reference",
        label: `World Cup broadcast — ${data.team} vs ${opponent}`,
        fallbackMime: "image/png",
      });
    } catch (err) {
      return fail("store", err);
    }

    // 2. Animate with Seedance 2.0 reference-to-video using the broadcast image.
    const videoPrompt = buildVideoPrompt({
      scenario: data.scenario,
      name: data.name,
      team: data.team,
      language,
    });
    let videoUrl: string | null = null;
    const runSeedance = async (prompt: string) =>
      falRun(
        "bytedance/seedance-2.0/reference-to-video",
        {
          prompt,
          image_urls: [imageUrl],
          aspect_ratio: "16:9",
          resolution: "720p",
          duration: "10",
          generate_audio: true,
        },
        { label: "seedance-2.0-r2v", timeoutMs: 20 * 60_000 },
      );
    try {
      let vidOut: unknown;
      try {
        vidOut = await runSeedance(videoPrompt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Seedance partner validation occasionally flags benign crowd scenes.
        // Retry once with a sanitized prompt that drops anything spicy.
        if (/content_policy_violation|partner_validation_failed|sensitive content/i.test(msg)) {
          console.warn("[world-cup] retrying with sanitized prompt after content flag");
          const safePrompt = [
            `Wholesome sports broadcast clip, cinematic daytime match atmosphere. A spectator subject sits in a lively football stadium surrounded by friendly fans in ${data.team} jerseys and scarves, smiling and waving a small ${data.team} flag.`,
            `The broadcast camera finds them in the crowd. They grin, point at the camera, give a thumbs-up, then mouth their team's name and cheer.`,
            `Family-friendly atmosphere, no contact, no chaos, no spilled drinks, no removed clothing — just one happy fan reacting to the match. Broadcast overlay with live score and match timer in the corner, all on-screen graphics rendered in ${language}, natural arena lighting, authentic live TV color grading.`,
          ].join(" ");
          vidOut = await runSeedance(safePrompt);
        } else {
          throw err;
        }
      }
      videoUrl = falPickVideoUrl(vidOut);
      if (!videoUrl) {
        return fail("video", new Error(
          `seedance returned no video URL. Raw: ${JSON.stringify(vidOut).slice(0, 400)}`,
        ));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/content_policy_violation|partner_validation_failed|sensitive content/i.test(msg)) {
        return fail("video", new Error(
          "The video model flagged this clip as sensitive content (often a false positive on crowd shots). Try a different scenario or a different selfie.",
        ));
      }
      return fail("video", err);
    }

    let storedVid: { id: string; url: string; mime: string };
    try {
      storedVid = await downloadAndStoreUrl({
        projectId: data.projectId,
        userId: context.userId,
        sourceUrl: videoUrl,
        kind: "video",
        label: `World Cup 2026 — ${data.team} (${data.name})`,
        fallbackMime: "video/mp4",
        duration: 10,
      });
    } catch (err) {
      return fail("store", err);
    }

    if (renderJobId) {
      await context.supabase
        .from("render_jobs")
        .update({
          status: "done",
          final_asset_id: storedVid.id,
          finished_at: new Date().toISOString(),
        })
        .eq("id", renderJobId);
    }

    return {
      ok: true,
      image: { assetId: storedImg.id, assetUrl: storedImg.url, mime: storedImg.mime },
      video: { assetId: storedVid.id, assetUrl: storedVid.url, mime: storedVid.mime },
      imagePrompt,
      videoPrompt,
    };
  });
