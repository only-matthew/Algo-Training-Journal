#include<iostream>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        string s;cin>>s;
        int zero=0,one=0;
        for(int i=0;i<s.length();i++)
        {
            if(s[i]=='0'&&zero==0){
                zero=1;continue;
            }
            if(s[i]=='1'&&one==0){
                one=1;continue;
            }
            cout<<s[i];
        }
        cout<<endl;
    }
    return 0;
}