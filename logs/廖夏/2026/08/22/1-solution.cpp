#include<iostream>
#include<string>
using namespace std;
int main(){
    int k; string s; cin >> s >> k;
    int len = s.length();
    while(k--){
        for (int i = 0; i < s.length() - 1; i++){
            if (s[i] > s[i+1]){
                for (int j = i; j < s.length() - 1; j++)
                    s[j] = s[j+1];
                break;
            }
        }
        len--;
    }
    int i = 0;
    while (i < len && s[i] == '0') i++;
    if (i == len) cout << "0";
    for (; i < len; i++) cout << s[i];
    return 0;
}