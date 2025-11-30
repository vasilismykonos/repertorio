#!/usr/bin/env bash

# ΠΡΟΣΟΧΗ: Δεν σβήνουμε κανέναν υπάρχοντα index.
# Το παλιό WordPress συνεχίζει να χρησιμοποιεί τον index "songs".
# Εδώ φτιάχνουμε ΕΝΑΝ ΝΕΟ index "songs_next" μόνο για το νέο site.

curl -X PUT "http://localhost:9200/songs_next" -H 'Content-Type: application/json' -d'
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 1,
    "analysis": {
      "filter": {
        "greek_stemmer": {
          "type": "stemmer",
          "language": "greek"
        }
      },
      "analyzer": {
        "greek_custom": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "asciifolding",
            "greek_stemmer"
          ]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "song_id": {
        "type": "integer"
      },
      "Title": {
        "type": "text",
        "analyzer": "greek_custom"
      },
      "FirstLyrics": {
        "type": "text",
        "analyzer": "greek_custom"
      },
      "Lyrics": {
        "type": "text",
        "analyzer": "greek_custom"
      },

      "Composer": {
        "type": "text",
        "analyzer": "greek_custom"
      },
      "Lyricist": {
        "type": "text",
        "analyzer": "greek_custom"
      },
      "SingerFront": {
        "type": "text",
        "analyzer": "greek_custom"
      },
      "SingerBack": {
        "type": "text",
        "analyzer": "greek_custom"
      },

      "Category_ID": {
        "type": "keyword"
      },
      "Rythm_ID": {
        "type": "keyword"
      },

      "Chords": {
        "type": "integer"
      },
      "Partiture": {
        "type": "integer"
      },

      "Status": {
        "type": "keyword"
      }
    }
  }
}
'
