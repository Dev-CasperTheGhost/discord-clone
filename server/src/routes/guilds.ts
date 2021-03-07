import { Router, Response } from "express";
import { useAuth } from "../hooks";
import useValidObjectId from "../hooks/useValidObjectId";
import IRequest from "../interfaces/IRequest";
import ChannelModel, { Channel } from "../models/Channel.model";
import GuildModel, { Guild } from "../models/Guild.model";
import UserModel, { User } from "../models/User.model";
import logger from "../utils/logger";
import { errorObj } from "../utils/utils";

const router = Router();

function returnGuildChannels(guild: Guild, channelData: Channel[]) {
  const channels = [];

  for (let i = 0; i < guild.channel_ids.length; i++) {
    const channel = channelData.find((ch) => ch._id.toString() === guild.channel_ids[i]);

    channels.push(channel);
  }

  const noCateChannels = channelData.filter(
    (ch) => ch.parent_id === "no_parent" && ch?.type === 1 && ch?.guild_id === guild._id.toString(),
  );

  noCateChannels.forEach((ch) => channels.push(ch));

  return channels;
}

router.get("/", useAuth, async (req: IRequest, res: Response) => {
  try {
    const data = await GuildModel.find();
    const channelData = await ChannelModel.find();
    const user = await UserModel.findById(req.user);

    if (!user) {
      return res.json(errorObj("User was not found"));
    }

    const guilds = [];

    for (let i = 0; i < user.guilds.length; i++) {
      const channels = [];
      const guild = data.find((g) => g._id.toString() === user.guilds[i]);

      for (let i = 0; i < (guild?.channel_ids?.length || 0); i++) {
        const channel = channelData.find((ch) => ch._id.toString() === guild?.channel_ids[i]);

        channels.push(channel);
      }

      guilds.push({ ...(guild as any)?._doc, channels });
    }

    return res.json({ status: "success", guilds });
  } catch (e) {
    console.error(e);
    return res.json(errorObj("An error occurred")).status(500);
  }
});

router.get("/:guild_id", useValidObjectId("guild_id"), useAuth, async (req: IRequest, res: Response) => {
  const { guild_id } = req.params;
  const user = await UserModel.findById(req.user);
  const channelData = await ChannelModel.find();

  if (!user) {
    return res.json(errorObj("User was not found"));
  }

  if (!user.guilds.includes(guild_id)) {
    return res.json(errorObj("User is not in this guild")).status(401);
  }

  const guild = await GuildModel.findById(guild_id);

  if (!guild) {
    return res.json(errorObj("Guild was not found"));
  }

  const categories = returnGuildChannels(guild, channelData);

  return res.json({
    status: "success",
    guild: { ...(guild as any)._doc, channels: categories },
  });
});

router.get("/:guild_id/members", useValidObjectId("guild_id"), useAuth, async (req: IRequest, res: Response) => {
  const { guild_id } = req.params;
  const user = await UserModel.findById(req.user);

  if (!user) {
    return res.json(errorObj("User was not found"));
  }
  if (!user.guilds.includes(guild_id)) {
    return res.json(errorObj("User is not in this guild")).status(401);
  }

  const guild = await GuildModel.findById(guild_id);

  if (!guild) {
    return res.json(errorObj("Guild was not found"));
  }

  const members: User[] = [];
  for (let i = 0; i < guild.member_ids.length; i++) {
    const member = await UserModel.findById(guild.member_ids[i]?.toString(), {
      username: 1,
      _id: 1,
      avatar_id: 1,
      discriminator: 1,
    });

    members.push(member!);
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  return res.json({
    status: "success",
    members,
  });
});

router.post("/", useAuth, async (req: IRequest, res: Response) => {
  const { name } = req.body;

  try {
    if (!name) {
      return res.json(errorObj("Please provide a server name"));
    }

    const newGuild = await GuildModel.create({
      name,
      owner_id: `${req.user}`,
      member_ids: [
        {
          user_id: `${req.user?.toString()}`,
          permissions: ["ADMIN", "MANAGE_GUILD"],
        },
      ],
    });

    const category = await new ChannelModel({
      type: 2,
      name: "General",
      guild_id: `${newGuild._id}`,
      position: 0,
    }).save();

    const channel = new ChannelModel({
      parent_id: `${category._id}`,
      type: 1,
      name: "General",
      guild_id: `${newGuild._id}`,
      position: 1,
    });
    await channel.save();

    const user = await UserModel.findById(req.user);

    if (!user) {
      return res.json(errorObj("User was not found"));
    }

    user.guilds = [...user.guilds, newGuild._id.toString()];

    newGuild.channel_ids = [category._id?.toString(), channel._id?.toString()];
    await newGuild.save();
    await user.save();

    return res.json({ status: "success", guild_id: newGuild._id, channel_id: channel._id });
  } catch (e) {
    logger.error("create_guild", e);

    return res.json(errorObj("An unexpected error occurred, please try again later")).status(500);
  }
});

router.put("/:guild_id", useValidObjectId("guild_id"), useAuth, async (req: IRequest, res: Response) => {
  const { guild_id } = req.params;
  const { name } = req.body;

  if (!name) {
    return res.json(errorObj("please fill in all fields"));
  }

  try {
    const guild = await GuildModel.findById(guild_id);
    if (!guild) {
      return res.json(errorObj("guild was not found"));
    }

    guild.name = name;

    await guild.save();

    return res.json({
      status: "success",
    });
  } catch (e) {
    logger.error("UPDATE_GUILD", e);
    return res.json(errorObj("An error occurred")).status(500);
  }
});

router.delete("/:guild_id", useValidObjectId("guild_id"), useAuth, async (req: IRequest, res: Response) => {
  const { guild_id } = req.params;

  try {
    const user = await UserModel.findById(req.user);

    if (!user?.guilds.includes(guild_id)) {
      return res.json(errorObj("You are not in this guild"));
    }

    const guild = await GuildModel.findById(guild_id);

    if (guild?.owner_id?.toString() !== user._id?.toString()) {
      return res.json(errorObj("You are not the owner of this guild"));
    }

    await guild?.delete();
    user.guilds = user.guilds.filter((g) => g.toString() !== guild_id);
    await user.save();

    return res.json({
      status: "success",
    });
  } catch (e) {
    logger.error("DELETE_GUILD", e);
    return res.json(errorObj("An error occurred")).status(500);
  }
});

export default router;
