#include<iostream>
using namespace std;
int main()
{
    int t;cin>>t;
    while(t--)
    {
        int n;string s;
        cin>>n>>s;
        int ans=0;
        for(int fir=0;fir<=1;fir++)
        {
            for(int sec=0;sec<=1;sec++)
            {
                bool flag=true;
                for(int i=0;i<n;i++)
                {
                    int a;
                    if(i%4==0)a=fir;
                    else if(i%4==1)a=sec;
                    else if(i%4==2)a=1-fir;
                    else a=1-sec;
                    if(s[i]!='?'&&s[i]-'0'!=a)
                    {
                        flag=false;break;
                    }
                }
                if(flag==true)ans++;
            }
        }
        cout<<ans<<endl;
    }
    return 0;
}