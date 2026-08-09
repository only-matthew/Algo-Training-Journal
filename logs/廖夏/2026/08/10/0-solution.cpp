#include<iostream>
#include<string>
#include<algorithm>
using namespace std;
string in;
string out;

bool is_num(char c){
    return '0' <= c && c <= '9';
}

string expand(string s){
    string res;
    int i = 0;
    while(i < s.length()){
        if (s[i] == '['){
            int j = s.length(), mul = 1;
            string sub;
            while(s[j] != ']') j--;
            if (is_num(s[i+1]) && is_num(s[i+2])) {
                mul = (s[i+1]-'0')*10 + (s[i+2]-'0');
                sub = s.substr(i + 3, j - i - 3);
            }
            else if (is_num(s[i+1])) {
                mul = s[i+1] - '0';
                sub = s.substr(i + 2, j - i - 2);
            }
            // cout << "sub : "<< sub << endl;
            string sub_exp = expand(sub);
            // cout << "sub_exp : "<<sub_exp<<endl;
            while (mul--) res+= sub_exp;
            i = j+1;
        }
        else {
            res += s[i];
            i++;
        }
    }
    return res;
}

int main(){
    cin >> in;
    out = expand(in);
    cout << out;
    return 0;
}

#include<iostream>
#include<string>
using namespace std;
string in;

bool is_num(char c){
    return '0' <= c && c <= '9';
}

void expand(size_t& pos){
    while(pos < in.length() && in[pos] != ']'){
        if (in[pos] != '['){
            cout << in[pos++];
            continue;
        }

        pos++;
        int mul = 0;
        while(is_num(in[pos])){
            mul = mul * 10 + in[pos] - '0';
            pos++;
        }

        size_t begin = pos;
        for(int count = 0; count < mul; count++){
            pos = begin;
            expand(pos);
        }
        pos++;
    }
}

int main(){
    cin >> in;
    size_t pos = 0;
    expand(pos);
    return 0;
}