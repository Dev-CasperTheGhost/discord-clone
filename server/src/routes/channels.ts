import { Router, Response } from "express";
import slugify from "slugify";
import { useAuth } from "../hooks";
import useValidObjectId from "../hooks/useValidObjectId";
import Max from "../interfaces/Constants";
import IRequest from "../interfaces/IRequest";
import ChannelModel from "../models/Channel.model";
import GuildModel from "../models/Guild.model";
import MessageModel from "../models/Message.model";
import UserModel from "../models/User.model";
import logger from "../utils/logger";
import { errorObj } from "../utils/utils";

const router = Router();

router.post("/:guild_id", useValidObjectId("guild_id"), useAuth, async (req: IRequest, res: Response) => {
  const { type } = req.query;
  const { guild_id } = req.params;
  const { name, parent_id } = req.body;

  if (!guild_id) {
    return res.json(errorObj("You must provide a guild_id")).status(400);
  }

  if (!name) {
    return res.json(errorObj("Please provide a channel name")).status(400);
  }

  if (name.length > 25) {
    return res.json(errorObj("Channel name cannot be longer than 25 characters")).status(400);
  }

  const guild = await GuildModel.findById(guild_id);

  if (!guild) {
    return res.json(errorObj("Guild was not found")).status(404);
  }

  if (guild.channel_ids.length >= Max.CHANNELS) {
    return res.json(errorObj(`cannot have more than ${Max.CHANNELS} channels per guild`));
  }

  const allChannels = await ChannelModel.find({ guild_id: guild_id });
  const filteredChannels = allChannels.filter((c) =>
    c.type === 1 && c.parent_id === parent_id ? parent_id : "no_parent",
  );

  const newChannel = new ChannelModel({
    name: type === "1" ? slugify(name, { replacement: "-", lower: true }) : name,
    guild_id,
    type: Number(type),
    parent_id: type === "1" ? parent_id : "no_parent",
    // TODO: this isn't correct
    position: Number(type) === 1 ? filteredChannels.length - 1 : 0,
  });

  guild.channel_ids = [...guild.channel_ids, newChannel._id.toString()];

  try {
    await newChannel.save();
    await guild.save();
  } catch (e) {
    logger.error("create_channel", e);
    return res.json(errorObj("An unexpected error occurred, please try again later"));
  }

  return res.json({ status: "success", channel_id: newChannel._id });
});

router.get(
  "/:guild_id/:channel_id",
  useValidObjectId("guild_id", "channel_id"),
  useAuth,
  async (req: IRequest, res: Response) => {
    const { channel_id, guild_id } = req.params;

    const user = await UserModel.findById(req.user);
    if (!user) {
      return res.json(errorObj("User was not found"));
    }

    if (!user.guilds.includes(String(guild_id))) {
      return res.json(errorObj("User is not in this guild")).status(401);
    }

    const channel = await ChannelModel.findById(String(channel_id));

    if (!channel) {
      return res.json(errorObj("Channel was not found"));
    }

    if (channel?.guild_id.toString() !== guild_id) {
      return res.json(errorObj("Guild id's do not match"));
    }

    return res.json({ status: "success", channel: channel });
  },
);

router.put(
  "/:guild_id/:channel_id",
  useValidObjectId("guild_id", "channel_id"),
  useAuth,
  async (req: IRequest, res: Response) => {
    const { channel_id, guild_id } = req.params;
    const { topic, name, position } = req.body;

    if (!name) {
      return res.json(errorObj("You must provide a name"));
    }

    if (name.length > 25) {
      return res.json(errorObj("Channel name cannot be longer than 25 characters")).status(400);
    }

    if (topic && topic.length > 1024) {
      return res.json(errorObj("Channel topic cannot be longer than 1024 characters")).status(400);
    }

    const user = await UserModel.findById(req.user);
    const channel = await ChannelModel.findById(channel_id);

    if (!user) {
      return res.json(errorObj("User was not found"));
    }

    if (!channel) {
      return res.json(errorObj("Channel was not found"));
    }

    if (!user.guilds.includes(String(guild_id))) {
      return res.json(errorObj("User is not in this guild")).status(401);
    }

    try {
      await ChannelModel.findByIdAndUpdate(channel?._id, {
        name,
        topic,
        position,
      });
    } catch (e) {
      logger.error("UPDATE_CHANNEL", e);
    }

    return res.json({ status: "success" });
  },
);

router.delete(
  "/:guild_id/:channel_id",
  useValidObjectId("guild_id", "channel_id"),
  useAuth,
  async (req: IRequest, res: Response) => {
    const { channel_id, guild_id } = req.params;

    try {
      const guild = await GuildModel.findById(guild_id);
      const user = await UserModel.findById(req.user);
      const channel = await ChannelModel.findById(channel_id);

      if (!user) {
        return res.json(errorObj("User was not found"));
      }

      if (!user.guilds.includes(String(guild_id))) {
        return res.json(errorObj("User is not in this guild")).status(401);
      }

      if (!guild?.channel_ids.includes(channel_id)) {
        return res.json(errorObj("Channel does not exist in this guild"));
      }

      await MessageModel.deleteMany({ guild_id: guild._id, channel_id: channel?._id });
      await ChannelModel.findByIdAndDelete(channel?._id);

      await GuildModel.findByIdAndUpdate(guild?._id, {
        channel_ids: guild.channel_ids.filter((id) => id !== channel_id),
      });

      return res.json({ status: "success" });
    } catch (e) {
      logger.error("delete_channel", e);
      return res.json(errorObj("An unexpected error occurred, please try again later")).status(500);
    }
  },
);

export default router;
