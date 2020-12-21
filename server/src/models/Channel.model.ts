import { model, Schema, Document } from "mongoose";

export interface Channel extends Document {
  name: string;
  topic: string;
  nsfw: boolean;
  guild_id: string;
  created_at: number;
}

const ChannelSchema = new Schema({
  name: {
    type: String,
    required: true,
    maxlength: 50,
  },
  topic: {
    type: String,
    default: null,
  },
  nsfw: {
    type: Boolean,
    default: false,
  },
  guild_id: {
    type: String,
    required: true,
  },
  created_at: {
    type: Number,
    default: () => Date.now(),
  },
});

export default model<Channel>("Channel", ChannelSchema);
